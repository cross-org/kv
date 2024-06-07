## Unrelesed

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
