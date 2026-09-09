# iLoveMd

iLoveMd.tech is a Markdown editing, preview, annotation and export workspace with a shared preview/export renderer. Source is authoritative. The export service produces real PDF, PNG and standalone HTML artifacts; Markdown and asset bundles download in the browser.

## Run locally

Requires Node.js 22.22 or a compatible maintained Node release, npm, and Playwright Chromium. No database, account, API key or AI service is required.

```powershell
npm ci
npx playwright install chromium
npm run build
npm start
```

Open **http://127.0.0.1:4174**. The initial build is required because exports use the bundled browser runtime.

For development, run `npm run dev` and open **http://127.0.0.1:5173**. The frontend proxies `/api` to port 4174. Rebuild after changing export-runtime, diagram rendering or document styling; the export service uses the compiled runtime. Restart the service after changing embedded font/style resources.

## Write, preview, export

- Edit the sample, import a `.md` file, drop an image, or choose a template. Ordinary paste inserts text; image paste opens a description/caption dialog.
- Switch between editor, split and preview modes without recreating the editor. Drag the divider or focus it and use arrow keys.
- Enable Sync scroll for source-block mapping. Click an outline entry to navigate. Search/replace is available from the editor toolbar; Ctrl/Cmd+K opens the command palette.
- Source and images autosave in IndexedDB. Local history retains up to 50 revisions. Conflicting browser tabs preserve recovery copies and show an alert. Browser storage can be cleared or evicted; download bundles for durable backups.
- Adjust interface/document themes and reading settings independently. Export theme is separate and defaults to light.
- Generate a PDF preview, inspect actual pages, then download the same bytes. Missing content blocks normal export; explicitly acknowledged warning exports contain diagnostics.
- Ctrl/Cmd+S downloads unchanged Markdown. The legacy-compatible `.folio.zip` bundle preserves source, settings and referenced local image data and can be re-imported without breaking existing backups.

## Project structure

| Area | Responsibility |
| --- | --- |
| `apps/web` | React/CodeMirror workspace, local storage, browser workers, PDF.js preview |
| `apps/export` | Fastify API, bounded parser worker, isolated Chromium contexts, artifact lifecycle |
| `packages/engine` | CommonMark/GFM parser, source mapping, directives, math, highlighting, diagnostics |
| `packages/themes` | Shared document styles for browser and print |
| `tests` | Engine, actual export and end-to-end regression fixtures |
| `docs` | Support matrix, architecture, security, deployment, validation and notices |

## Validation

```powershell
npm run typecheck
npm run build
npm test
npm run test:e2e
npm audit
npm run licenses
```

The PDF integration suite needs Poppler commands `pdftotext`, `pdfinfo`, and `pdffonts` on PATH. `npm test` creates `output/pdf/document.png`, which the asset browser test imports. Run these commands in the documented order. Browser tests can start the local service automatically or reuse one you started.

For interactive debugging: `npx playwright test --debug`. For a headed run without pausing: `npx playwright test --headed`. Reports and traces are written under `output/playwright`; PDF evidence is under `output/pdf`. Tests never modify production data.

## Current release status

This is a working implementation, not a certified production release. See [validation](docs/validation.md), [support matrix](docs/support-matrix.json), [syntax](docs/syntax.md), [architecture](docs/architecture.md), and [deployment](docs/deployment.md) for evidence and boundaries. PDF tagging is enabled but PDF/UA conformance and comprehensive assistive-technology coverage are not claimed.

The portfolio URL is optional: set `VITE_PORTFOLIO_URL` in `apps/web/.env.local` before building. No placeholder link is shown when unset, and exported documents contain no portfolio link or watermark. Analytics deployment and external-account setup are documented in [analytics, privacy and reporting](docs/analytics-seo.md).
