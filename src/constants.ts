export const LOCK_DEFAULT_MAX_RETRIES = 32;
export const LOCK_DEFAULT_INITIAL_RETRY_INTERVAL_MS = 20; // Increased with itself on each retry, so the actual retry interval is 20, 40, 60 etc. 32 and 20 become about 10 seconds total.
export const LOCK_STALE_TIMEOUT_S = 60_000;

export const SUPPORTED_LEDGER_VERSIONS = ["ALPH"];

export const LEDGER_BASE_OFFSET = 1_024;

export const LEDGER_MAX_READ_FAILURES = 10;

export const LEDGER_PREFETCH_BYTES = 2_048;

export const SYNC_INTERVAL_MS = 1_000;
