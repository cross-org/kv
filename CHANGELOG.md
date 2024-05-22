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
