## 0.17.2

- Update to work with Deno 2.0

## 0.17.1

- Fix missig awaits when closing file descriptor
- Ensure file is locked by the current process before writing anything

## 0.17.0

- Add parameter `ignoreTransactionErrors` to `open()` and `sync()`.
- Make cli `open` and `open:noindex` ignore errors by default.
- Add cli command `repair`
- Add optional parameter `ignoreReadErrors` to commands `open`, `sync`, `scan`
  and `vacuum`
- Fix problem with murmurHash implementation
- Allow using different hashing algorithms per database version

## 0.16.5

- Makes cli tool `open` and `close` more resilient to errors.
- Dependency update.

## 0.16.4

- Refactor of file locks during a vacuum

## 0.16.3

- Added `KV.defer(promiseToHandle, [errorHandler], [timeoutMs])` method to allow
  non-awaited promises to be tracked and settled during `KV.close()`.
  - `errorHandler` (optional): A function to handle errors that occur during
    promise resolution/rejection. If not provided, errors will silently ignored.
  - `timeoutMs` (optional): A timeout (in milliseconds) for promise resolution.
    If the promise doesn't settle within this time during `KV.close()`, a
    warning will be logged. Defaults to 5000ms.
- Fix cli tool not being able to open any database after a failed open
- Code refactors

## 0.16.3

- Added `KV.defer(promiseToHandle, [errorHandler], [timeoutMs])` method to allow
  non-awaited promises to be tracked and settled during `KV.close()`.
  - `errorHandler` (optional): A function to handle errors that occur during
    promise resolution/rejection. If not provided, errors will silently ignored.
  - `timeoutMs` (optional): A timeout (in milliseconds) for promise resolution.
    If the promise doesn't settle within this time during `KV.close()`, a
    warning will be logged. Defaults to 5000ms.
- Fix cli tool not being able to open any database after a failed open
- Code refactors

## 0.16.2

- Fix for Node.js; use `readline` instead of prompt

## 0.16.1

- Fix for Node.js not treating subarrays of buffers as expected

## 0.16.0

**Breaking change, databases created using earlier versions is not compatible
with 0.16.0 and up.**

- Use 32 bit MurmurHash3 (from new dependency `npm:ohash` instead of SHA-1 for
  transaction integrity check, saving time and storage
- Precalculate the Uint32Array of the transaction signature, improving
  performance
- Use CBOR-encoding of key instead of custom implementation, improving
  performance
- Avoid copying arraybuffers in certain situations
- Prefetch data on transaction read, severely reducing the number of disk reads

## 0.15.11

- Remove option doLock from `.sync()`
- Remove unused code from `key.ts`
- Add benchmark for getting data that does not exist
- Rename internal function `toAbsolutePath` to `toNormalizedAbsolutePath` and
  clarify code with additional comments
- Adds various missing test to reduce the risk for regression bugs

## 0.15.10

- Do not assume that the ledger is open for the full duration of each method
  call.

## 0.15.9

- Fix `isOpen´ to return false while closing the database

## 0.15.8

- Remove sync result `noop` as isn't used anywhere anymore.
- Adds `fetchData` option to `scan`. Setting this to `false` enables faster
  retrieval of transaction metadata.
- Change the `stats` cli command to use the new fast scan.
- Fix ledgerPath not being reset on close.
- Adds missing commands to the cli `help` output.
- Remove `a.bridge() // this is bridge`-comments

## Fixes

- Fixed Deno panic on decoding data from cache

## 0.15.7

## Changes

- Do not freeze the database during vacuum
- Reduce time in locked state during vacuum
- Only unlock old ledger after successful vacuum
- Only re-open ledger after successful vacuum

## Fixes

- Fixed Deno panic on decoding data from cache

## 0.15.6

## Additions

- Fixed order of transactions returned by `iterate` and `listAll`

## 0.15.5

## Additions

- Add argument `reverse` to `iterate` and `listAll` to allow almost instant
  queries for "last x transactions matching query y".
- Reduce lock time on writing new transactions.
- Optimize the logic of writing new transactions.

## Fixes

- Make sure the results of `iterate` and `listAll` are returned in insertion
  order, or reverse insertion order if `reverse` is set.

## 0.15.4

- Fix for `prompt` totally blocking the event loop in the cli tool, preventing
  synchronization.
- Make the watchdog slightly more invincible.

## 0.15.3

- Internal fix; Always unblock sync even if a vacuum fails
- Added `sync` cli command, to force a synchronization of the cli instance.

## 0.15.2

- Fixed a problem where records were overwritten during large atomic transaction
  writes.
- Renamed the CLI command `sysinfo` to `stats` and added ledger statistics.
- Added a constant factor `LEDGER_CACHE_MEMORY_FACTOR` to approximate the actual
  memory used by the ledger cache, based on raw data size.
- Added a `recursive` option to `.scan()` to allow recursively counting
  transactions in the ledger.
- Improved error handling in cli commands.
- Increase `LOCK_STALE_TIMEOUT_MS` from 60 seconds to 3 hours, to allow longer
  running queries.
- Fixed error where ledger was unlocked instantly after a failed locking
  operation.
- Added `unlock`-command to the cli interface, to allow manually unlocking a
  database from a crashed process.

## 0.15.1

- Fixed problem where keys lingered when running .listKeys() after a deletion.
- Adds `vacuum` cli command
- Fixes missing await in `.scan()`

## 0.15.0

- Added in-memory cache for ledger
- Added option `disableIndex` for faster startup in scenarios where you don't
  have to query the index.
- Added option `ledgerCacheSize` to control how much of the ledger to cache in
  memory, for faster retrieval.
- Refactor of cli tool
- Added command `open:noindex` to cli-tool.
- Added the `.scan()` method to extract full transaction history for a certain
  key.

## 0.14.0

- Cli-tool `ckv` now included in `@cross/kv` through export `@cross/kv/cli`
  - Install with `deno install -A -g -n ckv jsr:@cross/kv/cli` and run `ckv`
  - Run without installing with `deno run -A jsr:@cross/kv/cli`

## Other changes

- Renamed `key.toStringRepresentation()` to `.stringify()`
- Added static function `KVKeyImplementation.parse()` which returns a `KVKey`.
- Various internal optiomizations

## 0.13.2

- Be more graceful when closing

## 0.13.1

- Allow unlocking the database while closing it.

## 0.13.0

- Only throw in `.sync()` on closed database if the force parameter is true.
- Make all relevant methods (`.get()`, `.set()`, `.iterate()`, `.listAll()` ...)
  type safe using generics
- Update docs

## 0.12.1

- Add method `.isOpen()`

## 0.12.0

- Use a header flag instead of separate file to lock/unlock database
- Update ledger version `B011`->`B012` with backwards compatibility
- Implement atomic transactions

## 0.11.0

- Update ledger version `BETA`->`B011` "Beta 0.11"
- Use the supplied database path without adding `.data`
- Reduce header length from 1024 to 256 bytes
- Add feature `.watch(query, callback, recursive)`
- Change lockfile name from `path/to/db.lock` to `path/to/db-lock`
- Change temporary name from `path/to/db.tmp` to `path/to/db-tmp`
- Allow all unicode letters and numbers in string key parts
- Add `CHANGELOG.md`
- Code cleanup
