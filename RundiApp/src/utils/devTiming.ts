export function devTiming(scope: string, stage: string, started: number) {
  if (__DEV__) console.log(`[${scope} timing]`, { stage, durationMs: Date.now() - started });
}
