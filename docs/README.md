# @cross/kv Documentation

This directory contains the Lumocs-based documentation for @cross/kv, which is
automatically built and deployed to GitHub Pages.

## Structure

- `_config.ts` - Lumocs configuration file
- `deno.json` - Deno tasks and import map
- `src/` - Documentation source files (Markdown)
- `_site/` - Generated static site (not committed, created during build)

## Local Development

### Build the documentation

```bash
cd docs
deno task build
```

### Serve locally

```bash
cd docs
deno task serve
```

Then open http://localhost:8000 in your browser.

## Deployment

The documentation is automatically built and deployed to GitHub Pages when
changes are pushed to the `main` branch via the `.github/workflows/pages.yaml`
workflow.

## Adding New Pages

1. Create a new `.md` file in `src/`
2. Add frontmatter with `title` and `nav_order`:
   ```markdown
   ---
   title: "Page Title"
   nav_order: 8
   ---
   ```
3. Write your content in Markdown
4. Build and test locally before committing

## Updating

When updating the documentation:

- Keep the KV_VERSION in `src/_data.json` synchronized with `deno.json` in the
  root
- Update the changelog page when new versions are released
- Ensure all code examples are tested and working
