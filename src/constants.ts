export const LOCK_DEFAULT_MAX_RETRIES = 32;
export const LOCK_DEFAULT_INITIAL_RETRY_INTERVAL_MS = 20; // Increased with itself on each retry, so the actual retry interval is 20, 40, 60 etc. 32 and 20 become about 10 seconds total.
export const LOCK_STALE_TIMEOUT_S = 60_000;
