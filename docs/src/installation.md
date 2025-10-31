---
title: "Installation"
nav_order: 2
---

# Installation

---

## Library Installation

Install `@cross/kv` using your preferred package manager:

### Using npm

```bash
npx jsr add @cross/kv
```

### Using Deno

```bash
deno add @cross/kv
```

### Using Bun

```bash
bunx jsr add @cross/kv
```

## Command Line Client

Install the `ckv` command line client for Deno:

```bash
deno install -frA --name ckv jsr:@cross/kv/cli
```

### Using the CLI

After installation, you can use the CLI to interact with KV databases:

```bash
# Run without installing
deno run -A jsr:@cross/kv/cli

> open my.db
Success [10.30 ms]

> set:json my.key {"hello":"kv"}
Success [31.70 ms]

> get my.key

Key:             ["my","key"]
Operation:       SET (1)
Timestamp:       2024-05-26T19:49:49.471Z
Hash:            abdf6eb7a3fe04af920f31a599ce0cc069d29041

{ hello: "kv" }

Success [7.74 ms]
```

## Next Steps

- Read the [API Documentation](api) to learn about available methods
- Explore [Examples](examples) for common use cases
- Learn about [Concurrency](concurrency) features
