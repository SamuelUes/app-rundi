export interface RideShareCodeEntry {
  code: string;
  rideId: string;
  createdBy: string;
  createdAt: number;
  expiresAt: number;
}

export interface RideShareCodeStore {
  getIndex(rideId: string): Promise<RideShareCodeEntry | null>;
  findLegacyEntries(rideId: string): Promise<Record<string, RideShareCodeEntry> | null>;
  transactIndex(rideId: string, candidate: RideShareCodeEntry, now: number): Promise<RideShareCodeEntry | null>;
  transactCode(code: string, candidate: RideShareCodeEntry, now: number): Promise<RideShareCodeEntry | null>;
  replaceIndex(rideId: string, expectedCode: string, replacement: RideShareCodeEntry): Promise<RideShareCodeEntry | null>;
}

export interface GetOrCreateRideShareCodeOptions {
  rideId: string;
  createdBy: string;
  now: number;
  generateCode: () => string;
  isValidCode: (code: string) => boolean;
}

const SHARE_CODE_TTL_MS = 4 * 60 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;

export function isActiveRideShareCode(
  entry: RideShareCodeEntry | null | undefined,
  now: number,
): entry is RideShareCodeEntry {
  return Boolean(
    entry &&
    typeof entry.code === 'string' &&
    typeof entry.expiresAt === 'number' &&
    entry.expiresAt > now,
  );
}

function selectLatestLegacyCode(
  entries: Record<string, RideShareCodeEntry> | null,
  rideId: string,
  now: number,
  isValidCode: (code: string) => boolean,
): RideShareCodeEntry | null {
  return Object.entries(entries || {})
    .filter(([code, entry]) =>
      isValidCode(code) &&
      entry?.rideId === rideId &&
      typeof entry.expiresAt === 'number' &&
      entry.expiresAt > now,
    )
    .sort(([, left], [, right]) => {
      const leftCreatedAt = typeof left.createdAt === 'number' ? left.createdAt : Number.NEGATIVE_INFINITY;
      const rightCreatedAt = typeof right.createdAt === 'number' ? right.createdAt : Number.NEGATIVE_INFINITY;
      return rightCreatedAt - leftCreatedAt;
    })[0]?.[1] ?? null;
}

function createEntry(
  rideId: string,
  createdBy: string,
  code: string,
  now: number,
): RideShareCodeEntry {
  return {
    code,
    rideId,
    createdBy,
    createdAt: now,
    expiresAt: now + SHARE_CODE_TTL_MS,
  };
}

export async function getOrCreateRideShareCode(
  store: RideShareCodeStore,
  { rideId, createdBy, now, generateCode, isValidCode }: GetOrCreateRideShareCodeOptions,
): Promise<RideShareCodeEntry> {
  let index = await store.getIndex(rideId);
  if (!isActiveRideShareCode(index, now)) {
    const legacy = selectLatestLegacyCode(await store.findLegacyEntries(rideId), rideId, now, isValidCode);
    index = await store.transactIndex(
      rideId,
      legacy || createEntry(rideId, createdBy, generateCode(), now),
      now,
    );
  }

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    if (!isActiveRideShareCode(index, now)) {
      index = await store.transactIndex(rideId, createEntry(rideId, createdBy, generateCode(), now), now);
      if (!isActiveRideShareCode(index, now)) continue;
    }

    const mapping = await store.transactCode(index.code, index, now);
    if (isActiveRideShareCode(mapping, now) && mapping.rideId === rideId) {
      return mapping;
    }

    const replacement = createEntry(rideId, createdBy, generateCode(), now);
    index = await store.replaceIndex(rideId, index.code, replacement) || await store.getIndex(rideId);
  }

  throw new Error('No se pudo generar un código único');
}
