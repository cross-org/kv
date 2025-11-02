# Code Coverage Report

**Generated:** 2025-11-02

## Overall Coverage

| Metric          | Percentage |
| --------------- | ---------- |
| Branch Coverage | 75.5%      |
| Line Coverage   | 80.5%      |

## Per-File Coverage

| File              | Branch % | Line % | Status               |
| ----------------- | -------- | ------ | -------------------- |
| constants.ts      | 100.0    | 100.0  | ✅ Excellent         |
| utils/randomts.ts | 100.0    | 100.0  | ✅ Excellent         |
| index.ts          | 94.4     | 96.4   | ✅ Good              |
| key.ts            | 91.3     | 89.6   | ✅ Good              |
| kv.ts             | 72.9     | 82.7   | ⚠️ Fair              |
| ledger.ts         | 57.4     | 81.7   | ⚠️ Fair              |
| transaction.ts    | 52.0     | 76.3   | ⚠️ Needs Improvement |
| cache.ts          | 50.0     | 76.5   | ⚠️ Needs Improvement |
| prefetcher.ts     | 33.3     | 84.8   | ⚠️ Needs Improvement |
| utils/file.ts     | 33.3     | 68.1   | ⚠️ Needs Improvement |
| utils/murmur.ts   | 80.0     | 45.6   | ⚠️ Needs Improvement |

## Files Needing Attention

### Priority: High (Branch Coverage < 60%)

- **prefetcher.ts**: 33.3% branch coverage, 84.8% line coverage
- **utils/file.ts**: 33.3% branch coverage, 68.1% line coverage
- **cache.ts**: 50.0% branch coverage, 76.5% line coverage
- **transaction.ts**: 52.0% branch coverage, 76.3% line coverage
- **ledger.ts**: 57.4% branch coverage, 81.7% line coverage

### Priority: High (Line Coverage < 70%)

- **utils/murmur.ts**: 80.0% branch coverage, 45.6% line coverage
- **utils/file.ts**: 33.3% branch coverage, 68.1% line coverage

## How to Generate Coverage

### Quick Check (Console Summary)

```bash
deno task check
```

This runs:

- Code formatting check (`deno fmt --check`)
- Linting (`deno lint`)
- Type checking (`deno check`)
- Doc linting (`deno doc --lint`)
- All tests with coverage collection
- Coverage report generation

Output includes:

- Coverage summary in console
- LCOV report at `cov_profile.lcov`
- HTML report at `cov_profile/html/`

### Detailed HTML Report with Browser View

```bash
deno task check-coverage
```

**Requirements**: This requires `lcov` package:

```bash
# On Ubuntu/Debian
sudo apt-get install lcov

# On macOS
brew install lcov
```

This command:

1. Runs all checks and tests
2. Generates HTML coverage report
3. Shows coverage summary in console
4. Starts a local file server to view the HTML report

Then navigate to http://localhost:4507 to view the interactive coverage report.

### Manual Coverage Generation

```bash
# 1. Run tests with coverage profiling
deno test --allow-read --allow-write --allow-env --allow-net --allow-sys --allow-run --unstable-kv --coverage=cov_profile

# 2. Generate coverage report
deno coverage cov_profile --exclude=test/ --lcov --output=cov_profile.lcov

# 3. View summary
deno coverage cov_profile --exclude=test/
```

## Test Statistics

- **Total Tests**: 87
- **Status**: All passing ✅

### Test Distribution by File

- `test/key.test.ts`: 36 tests (Key validation, parsing, queries)
- `test/kv.test.ts`: 45 tests (Core KV operations, transactions, watching)
- `test/ledger.test.ts`: 4 tests (Ledger header operations)
- `test/transaction.test.ts`: 2 tests (Transaction serialization)

## CI/CD Integration

The current CI workflow (`tests.yaml`) uses reusable workflows for Deno, Bun,
and Node testing but does not include coverage reporting. Coverage is currently
generated locally only.

### Running Coverage in CI

To add coverage reporting to CI, you could:

1. **Add coverage to the Deno CI step** by modifying the reusable workflow or
   adding a separate coverage job
2. **Upload coverage to services** like Codecov or Coveralls
3. **Generate coverage badges** for the README

Example GitHub Actions step for coverage:

```yaml
- name: Generate Coverage
  run: |
    deno test --allow-read --allow-write --allow-env --allow-net --allow-sys --allow-run --unstable-kv --coverage=cov_profile
    deno coverage cov_profile --exclude=test/ --lcov --output=cov_profile.lcov
```

## Coverage Goals

Recommended coverage targets:

- **Branch Coverage**: 80% (currently 75.5%)
- **Line Coverage**: 85% (currently 80.5%)

Focus areas for improvement:

1. Add tests for error paths and edge cases in `prefetcher.ts`, `utils/file.ts`,
   and `cache.ts`
2. Increase line coverage in `utils/murmur.ts`
3. Add more transaction test scenarios for `transaction.ts`
4. Test ledger edge cases in `ledger.ts`
