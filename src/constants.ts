// Configurable
export const LOCK_DEFAULT_MAX_RETRIES = 32;
export const LOCK_DEFAULT_INITIAL_RETRY_INTERVAL_MS = 30; // Increased with itself on each retry, so the actual retry interval is 20, 40, 60 etc. 32 and 20 become about 10 seconds total.
export const LOCK_STALE_TIMEOUT_MS = 60_000;
export const LEDGER_CURRENT_VERSION: string = "BETA";
export const SUPPORTED_LEDGER_VERSIONS: string[] = [
  "ALPH",
  LEDGER_CURRENT_VERSION,
];
export const LEDGER_MAX_READ_FAILURES = 10;
export const LEDGER_PREFETCH_BYTES = 2_048;
export const SYNC_INTERVAL_MS = 2_500; // Overridable with instance configuration

// Extremely constant
export const LEDGER_BASE_OFFSET = 1_024; // DO NOT CHANGE!
export const KV_KEY_ALLOWED_CHARS = /^[a-zA-Z0-9\-_@]+$/;
export const LEDGER_FILE_ID: string = "CKVD"; // Cross/KV Database
export const TRANSACTION_SIGNATURE: string = "CKT"; // Cross/Kv Transaction
