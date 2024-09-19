// Configurable
export const LOCK_DEFAULT_MAX_RETRIES = 40;
export const LOCK_DEFAULT_INITIAL_RETRY_INTERVAL_MS = 30; // Increased with itself on each retry, so the actual retry interval is 20, 40, 60 etc. 32 and 20 become about 10 seconds total.
export const LOCK_STALE_TIMEOUT_MS = 6 * 60 * 60 * 1000; // Automatically unlock a ledger that has been locked for more than 2*60*60*1000 = 2 hours.
export const LEDGER_CURRENT_VERSION: string = "B017";
export const SUPPORTED_LEDGER_VERSIONS: string[] = [
  LEDGER_CURRENT_VERSION,
  "B016",
];
export const LEDGER_PREFETCH_BYTES = 50 * 1024; // Prefetch chunks of 50KB of data while reading the ledger
export const LEDGER_MAX_READ_FAILURE_BYTES = 10 * 1024 * 1024; // Allow at most 10MB of read failures
export const SYNC_INTERVAL_MS = 2_500; // Overridable with instance configuration
export const LEDGER_CACHE_MB = 100; // Allow 100 MBytes of the ledger to exist in RAM. Not an exact science due to LEDGER_CACHE_MEMORY_FACTOR.
export const LEDGER_CACHE_MEMORY_FACTOR = 3; // Assume that ledger entries take about n times as much space when unwrapped in RAM. Used for ledger cache memory limit, does not need to be exakt.

// Extremely constant
export const LEDGER_BASE_OFFSET = 256; // DO NOT CHANGE!
export const LOCKED_BYTES_LENGTH = 8; // Length of timestamp
export const LOCK_BYTE_OFFSET = LEDGER_BASE_OFFSET - LOCKED_BYTES_LENGTH; // Last 8 bytes of the header
export const KV_KEY_ALLOWED_CHARS = /^[@\p{L}\p{N}_-]+$/u; // Unicode letters and numbers, undescore, hyphen and at
export const LEDGER_FILE_ID: string = "CKVD"; // Cross/KV Database
export const ENCODED_TRANSACTION_SIGNATURE: Uint8Array = new TextEncoder()
  .encode("T;"); // Cross/Kv Transaction
export const UNLOCKED_BYTES = new Uint8Array(LOCKED_BYTES_LENGTH);
export const LOCKED_BYTES = new Uint8Array(LOCKED_BYTES_LENGTH);
export const FORCE_UNLOCK_SIGNAL = 1;
