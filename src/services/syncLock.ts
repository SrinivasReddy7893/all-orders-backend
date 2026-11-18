// A Gmail sync should finish within minutes; a lock older than this was left
// behind by a crash or restart and may be taken over (see syncAccount).
export const SYNC_LOCK_TTL_MS = 15 * 60 * 1000;
