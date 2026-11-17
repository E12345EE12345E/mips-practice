# Deployment

The site is a static bundle (`dist/`). It needs no server features: Monaco and all workers are bundled locally and no CDN is used at runtime. Any static host works; the repository ships a GitHub Pages workflow.

## GitHub Pages

1. Push the repository to GitHub.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Push to `main`. `.github/workflows/pages.yml` installs from the lockfile, runs typecheck, lint, tests and the build, then deploys `dist/` with the official Pages actions.

The workflow uses least-privilege permissions (`contents: read`, `pages: write`, `id-token: write`), a `pages` concurrency group so deployments do not overlap, and the `github-pages` environment. All actions are pinned to commit SHAs and Node is pinned (`.nvmrc`). Update pins deliberately, for example with Dependabot, and keep the version comment next to each SHA.

### Base path

Vite's `base` comes from the `VITE_BASE` environment variable:

| Where it is served | `VITE_BASE` |
| --- | --- |
| Custom domain, or a user/organization site (`<user>.github.io`) | unset (`/`) |
| Project site (`<user>.github.io/<repo>/`) | `/<repo>/` |

`pages.yml` sets it automatically: `/` when `public/CNAME` exists, otherwise `/<repository-name>/`. Locally:

```bash
VITE_BASE=/my-repo/ npm run build && npx vite preview --base /my-repo/
```

(On Windows PowerShell: `$env:VITE_BASE="/my-repo/"; npm run build`.)

Workers, fonts and chunks are all resolved relative to the configured base, so both layouts work.

## Custom domain

1. Copy `public/CNAME.example` to `public/CNAME` and replace its single line with your hostname. This repository already ships `public/CNAME` set to `mips.ethanchen.me`; forks should replace it (or delete it to serve from `/<repo>/`).
2. Create a DNS record at your DNS provider:
   - subdomain: a `CNAME` record pointing to `<user>.github.io`
   - apex domain: `A`/`AAAA` records for GitHub Pages (see GitHub's documentation)
3. In **Settings → Pages**, enter the custom domain and enable **Enforce HTTPS** once the certificate is issued.
4. Push. Vite copies `public/CNAME` into `dist/`, and the workflow builds with base `/`.

`CNAME.example` is intentionally not named `CNAME`, so forks do not claim someone else's domain by accident.

## Other hosts

Run `npm ci && npm run build` and publish `dist/`. Set `VITE_BASE` if the site is not served from the root. No rewrite rules are needed (there is no client-side routing).

## Verifying a deployment

- Load the site and confirm the editor and the graph both appear (Monaco and the worker bundles loaded).
- Type a valid program and confirm the preview updates, then press **Check solution**.
- In the browser's network panel, confirm there are no requests to other origins.
- Run `npm run test:e2e` locally against the build before deploying.
