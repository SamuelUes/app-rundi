export function isEmail(v: string) {
  return /\S+@\S+\.\S+/.test(v);
}

export function isNonEmpty(v: string) {
  return v != null && String(v).trim().length > 0;
}
