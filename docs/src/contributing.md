---
title: "Contributing"
nav_order: 7
---

# Contributing

---

Contributions are welcome! Feel free to open issues or submit pull requests.

## Development Setup

1. Clone the repository:

```bash
git clone https://github.com/cross-org/kv.git
cd kv
```

2. Install Deno (if not already installed):

```bash
curl -fsSL https://deno.land/install.sh | sh
```

## Running Tests

The task `deno task check` runs all tests and is a good pre-commit check:

```bash
deno task check
```

This command will:

- Format check the code
- Lint the code
- Type check the code
- Generate documentation
- Run all tests
- Generate coverage reports

## Coverage Reports

To generate and view coverage reports with HTML output:

```bash
deno task check-coverage
```

Note: This requires `genhtml` to be available through the `lcov` package in most
distributions.

## Available Tasks

Check `deno.json` for all available tasks:

- `deno task cli` - Run the CLI tool
- `deno task check` - Run all checks (format, lint, test, coverage)
- `deno task check-coverage` - Run checks and generate HTML coverage report
- `deno task bench` - Run benchmarks
- `deno task check-deps` - Check for outdated dependencies

## Code Style

- Follow the existing code style
- Run `deno fmt` before committing
- Run `deno lint` to check for common issues
- Ensure all tests pass

## Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run `deno task check` to ensure everything passes
5. Commit your changes (`git commit -m 'Add some amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## Reporting Issues

When reporting issues, please include:

- A clear description of the problem
- Steps to reproduce the issue
- Expected behavior
- Actual behavior
- Your environment (OS, Deno/Node/Bun version, etc.)
- Any relevant code snippets or error messages

## License

By contributing to this project, you agree that your contributions will be
licensed under the MIT License.
