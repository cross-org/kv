# Agents quick checklist

This repo uses cross-org reusable CI for Deno, Bun, and Node. Make your changes pass the same checks locally.

Source of truth:
- Deno CI: https://github.com/cross-org/workflows/blob/main/.github/workflows/deno-ci.yml
- Bun CI: https://github.com/cross-org/workflows/blob/main/.github/workflows/bun-ci.yml
- Node CI: https://github.com/cross-org/workflows/blob/main/.github/workflows/node-ci.yml

Repo CI inputs (`.github/workflows/tests.yaml`):
- Deno: entrypoint=mod.ts, lint_docs=false, allow_outdated=false
- Bun: jsr deps set; npm deps: cbor-x
- Node: jsr deps set; npm deps: cbor-x; test_target: test/*.test.ts

Do before you commit:
- Deno: deno fmt --check; deno lint; deno check mod.ts; deno test -A; deno run -A jsr:@check/deps (no outdated deps allowed here)
- Bun: tests run with bun test after jsr/npm deps install
- Node (18/20/22): tests run with tsx; ESM required (package.json {"type":"module"})

Keep in mind:
- Don’t break the public entrypoint (mod.ts). If you change it, update tests.yaml.
- Prefer minimal diffs and stable public APIs.
- New deps must resolve via JSR/NPM across Deno/Bun/Node.
- Keep this file (AGENTS.md) lean if requested to add stuff.

Docs:
- Lives in docs/ (Lumocs). Keep README concise; link to docs pages.
- Changelog lives at docs/src/changelog.md and should align with GitHub Releases.
- If CI flips lint_docs=true, also run: deno doc --lint mod.ts

Network access (Copilot workspace):
- har.io, npmjs.org, registry.npmjs.org, deno.land, jsr.io
- github.com, raw.githubusercontent.com, bun.sh, wikipedia.org
