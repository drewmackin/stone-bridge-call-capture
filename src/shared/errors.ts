// =============================================================================
// Tiny shared helper — normalize any thrown value to a human-readable string.
// Used across main + renderer so error wording is consistent and not duplicated.
// =============================================================================

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
