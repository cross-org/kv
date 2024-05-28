// Configurable
export const LOCK_DEFAULT_MAX_RETRIES = 32;
export const LOCK_DEFAULT_INITIAL_RETRY_INTERVAL_MS = 30; // Increased with itself on each retry, so the actual retry interval is 20, 40, 60 etc. 32 and 20 become about 10 seconds total.
export const LOCK_STALE_TIMEOUT_MS = 60_000;
export const LEDGER_CURRENT_VERSION: string = "B013";
export const SUPPORTED_LEDGER_VERSIONS: string[] = [
  LEDGER_CURRENT_VERSION,
  "B011",
  "B012",
];
export const LEDGER_MAX_READ_FAILURES = 10;
export const LEDGER_PREFETCH_BYTES = 256;
export const SYNC_INTERVAL_MS = 2_500; // Overridable with instance configuration
export const LEDGER_CACHE_MB = 100; // Allow 100 MBytes of the ledger to exist in RAM

// Extremely constant
export const LEDGER_BASE_OFFSET = 256; // DO NOT CHANGE!
export const LOCKED_BYTES_LENGTH = 8; // Length of timestamp
export const LOCK_BYTE_OFFSET = LEDGER_BASE_OFFSET - LOCKED_BYTES_LENGTH; // Last 8 bytes of the header
export const KV_KEY_ALLOWED_CHARS = /^[@\p{L}\p{N}_-]+$/u; // Unicode letters and numbers, undescore, hyphen and at
export const LEDGER_FILE_ID: string = "CKVD"; // Cross/KV Database
export const TRANSACTION_SIGNATURE: string = "T;"; // Cross/Kv Transaction
export const UNLOCKED_BYTES = new Uint8Array(LOCKED_BYTES_LENGTH);
