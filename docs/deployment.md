# Deployment and export boundaries

## Local development

Run `npm ci`, then `npm run dev` and open <http://127.0.0.1:5173>.
PDF, PNG, and standalone HTML exports run in the browser, so local development
does not need Chromium installed by Playwright and does not need a second API
process. Run `npm run build`, then `npm exec -w @folio/web vite preview -- --host 127.0.0.1 --port 4174`
for static production-build validation.

The legacy Node renderer under `apps/export` remains as a reference renderer
and for artifact-level regression comparisons. It is not used by the web app or
the Cloudflare deployment.

## Static Cloudflare hosting

Cloudflare Pages can publish `apps/web/dist` after `npm run build`. All document
storage and rendering stay in the browser. The existing Wrangler configuration
is an alternative static-assets host, with no processing bindings required.

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
- PDFs are generated as tagged documents with searchable/selectable document
  text and repeated table header rows. Ordinary text and annotations remain vector
  graphics. Unsupported styled regions, complex scripts, math, and diagrams use
  local images at a minimum effective 300 DPI, with selectable text retained.
  Adding annotations uses the same layout and quality as a clean PDF. Formal PDF/UA conformance
  still requires an external accessibility audit and is not claimed.
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
