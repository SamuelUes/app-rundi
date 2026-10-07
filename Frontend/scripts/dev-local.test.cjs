const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildChildEnvironments,
  getJavaMajorVersion,
  isExpectedFirebaseProcess,
  isIncomingBlocked,
  isLoopbackBinding,
  parseSupabaseStatusEnv,
  redactSupabaseOutput,
  shouldStopSupabase,
} = require('./dev-local.cjs');

const supabaseOutput = [
  'API_URL="http://127.0.0.1:54321"',
  'ANON_KEY="local-anon-key"',
  'SERVICE_ROLE_KEY="local-service-role-key"',
  'JWT_SECRET="local-jwt-secret"',
].join('\n');

const localSupabase = {
  apiUrl: 'http://127.0.0.1:54321',
  anonKey: 'local-anon-key',
  serviceRoleKey: 'local-service-role-key',
  jwtSecret: 'local-jwt-secret',
};

test('parses legacy and current local Supabase API key names', () => {
  assert.deepEqual(parseSupabaseStatusEnv(supabaseOutput), localSupabase);
  assert.deepEqual(
    parseSupabaseStatusEnv([
      'API_URL=http://127.0.0.1:54321',
      'PUBLISHABLE_KEY=local-publishable-key',
      'SECRET_KEY=local-secret-key',
      'JWT_SECRET=local-jwt-secret',
    ].join('\n')),
    { ...localSupabase, anonKey: 'local-publishable-key', serviceRoleKey: 'local-secret-key' },
  );
});

test('rejects missing credentials without echoing key material', () => {
  for (const missing of ['API_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY', 'JWT_SECRET']) {
    const output = supabaseOutput
      .split('\n')
      .filter((line) => !line.startsWith(`${missing}=`))
      .join('\n');
    assert.throws(() => parseSupabaseStatusEnv(output), (error) => {
      assert.doesNotMatch(error.message, /local-(?:anon|service-role|jwt)-key|local-jwt-secret/);
      return true;
    });
  }
});

test('keeps privileged local keys out of the Expo environment', () => {
  const { expo, functions } = buildChildEnvironments(
    {
      API_BASE_URL_FIREBASE: 'https://us-central1-rundi-dev.cloudfunctions.net',
      PLATFORM_API_BASE_URL: 'https://remote.example/api',
      CALLS_REQUEST_BASE_URL: 'https://remote.example/functions',
      WS_URL_FIREBASE: 'https://rundi-dev-default-rtdb.firebaseio.com',
      FIREBASE_DATABASE_URL: 'https://rundi-dev-default-rtdb.firebaseio.com',
      BACKEND_MODE: 'local',
    },
    localSupabase,
  );

  assert.equal(expo.BACKEND_MODE, 'firebase');
  assert.equal(expo.USE_FIREBASE_EMULATORS, 'true');
  assert.equal(expo.FIREBASE_PROJECT_ID, 'rundi-dev');
  assert.equal(expo.API_BASE_URL_FIREBASE, 'http://127.0.0.1:5001/rundi-dev/us-central1');
  assert.equal(expo.PLATFORM_API_BASE_URL, expo.API_BASE_URL_FIREBASE);
  assert.equal(expo.CALLS_REQUEST_BASE_URL, expo.API_BASE_URL_FIREBASE);
  assert.equal(expo.WS_URL_FIREBASE, 'http://127.0.0.1:9002?ns=rundi-dev');
  assert.equal(expo.FIREBASE_DATABASE_URL, 'http://127.0.0.1:9002?ns=rundi-dev');
  assert.equal(expo.EXPO_PUBLIC_SUPABASE_URL, localSupabase.apiUrl);
  assert.equal(expo.EXPO_PUBLIC_SUPABASE_ANON_KEY, localSupabase.anonKey);
  assert.equal(expo.SUPABASE_SERVICE_ROLE_KEY, undefined);
  assert.equal(expo.SUPABASE_JWT_SECRET, undefined);
  assert.equal(functions.SUPABASE_URL, localSupabase.apiUrl);
  assert.equal(functions.SUPABASE_SERVICE_ROLE_KEY, localSupabase.serviceRoleKey);
  assert.equal(functions.SUPABASE_JWT_SECRET, localSupabase.jwtSecret);
  assert.equal(functions.GCLOUD_PROJECT, 'rundi-dev');
});

test('redacts the key formats printed by Supabase CLI startup', () => {
  const startupLines = [
    'anon key: local-anon-key',
    '│ Publishable │ sb_publishable_local-token │',
    '│ Secret │ sb_secret_local-token │',
    '│ Access Key │ 625729a08b95bf1b7ff351a663f3a23c │',
    '│ Secret Key │ 850181e4652dd023b7a98c58ae0d2d34bd487ee0cc3254aed6eda37307425907 │',
  ];
  const output = startupLines.map(redactSupabaseOutput).join('\n');
  assert.doesNotMatch(output, /local-anon-key|sb_publishable_|sb_secret_|625729a08b95|850181e4652d/);
  assert.equal((output.match(/\[redacted\]/g) || []).length, startupLines.length);
});

test('parses Java versions for the Firebase emulator prerequisite', () => {
  assert.equal(getJavaMajorVersion('openjdk version "17.0.19"'), 17);
  assert.equal(getJavaMajorVersion('java version "21.0.1"'), 21);
  assert.equal(getJavaMajorVersion('unrecognized version'), 0);
});

test('recognizes macOS firewall output for a blocked bundle', () => {
  assert.equal(isIncomingBlocked('Incoming connection to /Applications/Docker.app is blocked.'), true);
  assert.equal(isIncomingBlocked('Incoming connection to /Applications/Docker.app is permitted.'), false);
});

test('accepts only loopback Docker host bindings', () => {
  assert.equal(isLoopbackBinding('127.0.0.1:54321\n127.0.0.1:54322'), true);
  assert.equal(isLoopbackBinding('0.0.0.0:54321\n[::]:54321'), false);
  assert.equal(isLoopbackBinding(''), true);
});

test('validates Firebase process identity before allowing a stop signal', () => {
  assert.equal(
    isExpectedFirebaseProcess(
      { pid: 1234, projectId: 'rundi-dev' },
      'node firebase-tools emulators:start --project rundi-dev',
    ),
    true,
  );
  assert.equal(
    isExpectedFirebaseProcess(
      { pid: 1234, projectId: 'other-project' },
      'node firebase-tools emulators:start --project rundi-dev',
    ),
    false,
  );
  assert.equal(
    isExpectedFirebaseProcess({ pid: 1234, projectId: 'rundi-dev' }, 'node server.js'),
    false,
  );
});

test('stops Supabase only when this runner started it', () => {
  assert.equal(shouldStopSupabase(false), true);
  assert.equal(shouldStopSupabase(true), false);
});
