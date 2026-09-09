# Validation record

2026-09-09 rendering repair: TypeScript/build, 20 engine/export tests and all 16 Chromium journeys passed. The two focused import/recovery and diagram-geometry journeys also passed in headed Chrome with DevTools, Firefox and WebKit. Actual light/dark HTML, PDF and PNG artifacts were generated and inspected. Full evidence, tested boundaries and source-preserving table-break behavior are recorded in [newline-diagram-repair.md](newline-diagram-repair.md).

Validated locally on 2026-09-08 on Windows 11 with Node.js 22.22.0, npm 10.9.4, Playwright 1.63.0 and the bundled Chromium browser. The export service was bound to `127.0.0.1:4174`; documents and assets stayed local to the machine during these checks.

## Commands and results

| Check | Result | Evidence |
| --- | --- | --- |
| `npm run typecheck` | Passed | Strict TypeScript build has no errors. |
| `npm run build` | Passed | Vite production bundle created in `apps/web/dist`. |
| `npm test` | Passed: 18 tests | Parser, escaped-newline JSON/CRLF handling, citations, Mermaid family and long-label acceptance, security, malformed input, math, raster/SVG assets, actual PDF, PNG, HTML and image-validation fixtures. |
| `npx playwright test --project=chromium` | Passed: 13 tests | Editing, undo, recovery, views, mapped scrolling, responsive layout, accessibility scan, real downloads, bundle import, hostile content and export failure paths. |
| `npm audit --omit=dev --audit-level=high` | Passed | 0 vulnerabilities reported. |

The browser suite uses a real Chromium export path. The generated PDF fixture is inspected with Poppler: it has 10 pages, searchable text including all 180 table rows and the final marker, embedded document/KaTeX fonts, active links, tagging enabled, and the local test image. Page rasters were manually inspected at the start, table continuation, image page and final page. Relevant artifacts are under `output/pdf` and `output/playwright`.

## Browser coverage

The core editing/recovery journey and actual PDF journey were also previously exercised with Playwright Firefox and WebKit, and the PDF journey was re-run in Firefox after checksum-protected artifact transfer was added. A headed Chrome run with DevTools was used for the affected editing and export journeys. These are actual engine checks, not a Safari claim: WebKit coverage does not prove support for all Safari versions.

## Measurements

`output/playwright/performance.json` records 30 warm samples for the current 100 KB/100-equation fixture. The observed p95 settled-preview measurement was 694.3 ms. The automated input measurement was 351.2 ms and includes browser automation overhead, so it is not an INP measurement. The first-release targets in the plan are therefore not yet met or certified; long-document and export targets remain production-hardening work.

## Boundaries and remaining work

This is a working prototype with a shared renderer and inspectable exports, not a validated release candidate or a production deployment. PDF tagging and outlines are enabled, but PDF/UA conformance, reading-order validation with assistive technology, and broad screen-reader testing have not been established. Docker is installed on the validation host but its engine was not running, so the container smoke test remains unverified.

The support matrix records feature/output status and fixture evidence. Notable bounded support includes the documented Mermaid family allowlist with sanitized SVG output, citation marker rendering with generated references, GFM tables without merged cells, two-column print flow, restricted KaTeX/mhchem, approved opt-in video embeds, and PNG/JPEG/WebP/GIF/SVG images. Full LaTeX documents, nested/independently aligned columns, DOCX/EPUB, whole-document SVG, remote export fetching, and CJK font evidence remain outside the verified first release. PDF tagging and outlines are verified; PDF/UA conformance still requires a dedicated validator and assistive-technology review.
