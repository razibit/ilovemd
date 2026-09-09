# Deployment and export boundaries

## Local development

Run `npm ci`, then `npm run dev` and open <http://127.0.0.1:5173>.
PDF, PNG, and standalone HTML exports run in the browser, so local development
does not need Chromium installed by Playwright and does not need a second API
process. `npm run build && npm start` serves the production bundle on
<http://127.0.0.1:4174> for production-build validation.

The legacy Node renderer under `apps/export` remains as a reference renderer
and for artifact-level regression comparisons. It is not used by the web app or
the Cloudflare deployment.

## Cloudflare Workers

`wrangler.json` deploys `apps/web/dist` as static Worker assets with SPA
fallback. Build and preview it with:

```text
npm run build
npx wrangler dev
```

No export origin, secret, container, Browser Rendering binding, paid API,
database, or separately running service is required. Export work executes in
the visitor's browser and downloads through a temporary object URL in that tab.
Documents and local assets are not sent to Cloudflare during export.

## Browser export limits

- Source rendering retains the 2 MiB document limit and existing parser
  diagnostics.
- PDF and page-image exports are limited to 200 pages.
- Each rendered canvas is limited to 32 megapixels. Oversized full-document PNG
  requests fall back to a ZIP of page images.
- PDF pages are rasterized to preserve the inspected browser appearance and
  annotations. They are not tagged and their text is not selectable. Use the
  standalone HTML export when searchable/selectable content is required.
- The browser waits for fonts, local images, and diagrams. Missing resources are
  reported through export preflight; the user can explicitly include visible
  diagnostics where supported.
- A job times out after 60 seconds. Cancellation and failures leave the export
  dialog ready for a retry.

## Optional reference renderer

`npm start` still exposes the historical Fastify/Playwright API for maintainers
who need comparison artifacts. It is loopback-only by default and is not part
of the production architecture. The Dockerfile is likewise a development
reference, not a deployment requirement.
