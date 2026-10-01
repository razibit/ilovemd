# Annotation exports and independent workspace documents

Local implementation and validation record, 2026-10-01. No deployment, Git writes or GitHub writes were performed.

## Architecture repaired

The previous PDF converter reflowed Markdown and treated the sibling annotation SVG as flowing content. Image reconstruction changed typography or width, and standalone HTML lost the overlay's relative positioning context. The replacement uses one document surface and one coordinate system: unscaled CSS pixels from the document border box. Pointer input uses the inverse SVG screen matrix. Export freezes the matching document revision, waits for resources and checks recorded block geometry within one CSS pixel.

PDF pages now capture measured browser SVG rather than reflowing HTML. Ordinary text and annotation shapes retain vector representation, compatible fonts are embedded, and unsupported regions use local captures at a minimum effective 300 DPI with selectable text retained. PDF and page PNG share measured pagination, paper scaling, margins, repeated table headers and clipped crossing strokes. Annotated PNG width stays frozen; clean document/block PNG width remains configurable. Standalone HTML embeds assets, styles and fonts and places the overlay inside the sized relative document container.

The former single `current` head is replaced by IndexedDB v4 document heads, metadata and workspace selection. Atomic migration preserves the authoritative legacy head, recovers distinct historical documents and orphan annotation snapshots, and retains damaged originals for recovery. Each document has independent content, annotations, title, reading/export/drawing settings and scroll positions. Per-document save queues retain failed drafts and optimistic versions. Deletion tombstones prevent stale tabs from resurrecting documents. Shared assets remain available to other documents.

Only the active editor and preview are mounted. The sidebar virtualizes metadata rows, and inactive clean content is evicted. Create/template/import insert documents; rename, duplicate and confirmed deletion operate on their owners. Rendering, imports, annotations and exports reject late results belonging to another active document or revision.

## Validation coverage

- Unit tests cover annotations, compatibility, Markdown rendering, exports, measured page coverage, queued saves, conflicts, retained drafts and failed deletion recovery.
- Production acceptance runs use built static frontend files. Browser PDF/PNG/HTML exports assert that no `/api` processing requests occur. Optional reference-server tests remain separate.
- Five distinct annotated documents are switched repeatedly, renamed, duplicated, deleted, reloaded and exported. Source, settings, notes, titles and outlines remain isolated. Pending saves and deliberately delayed worker completions are exercised.
- Migration tests include an interrupted atomic upgrade, historical/orphan recovery and corrupt records. Failure tests cover quota errors, competing tabs, deleted-document tombstones and shared-asset preservation.
- A 1,000-document fixture verifies metadata virtualization and a single mounted editor.
- Preview zoom 50/100/175/250%, device scale factors 1/2, PNG scales 1/2/3, responsive desktop/tablet/mobile layouts, scrolling and pan are covered. A separate persistent Chrome profile exercises real browser zoom 75/100/125/175%; measured device pixel ratios were 0.9375/1.25/1.5625/2.1875 on this Windows display.
- The rich 14-page fixture includes headings, paragraphs, lists, links, code, tables, a local image, forced page breaks and all drawing tools with multiple colors, widths and opacity. Notes occur at the top, middle, end, image, edges and page crossings.
- PDF checks inspect page count, Unicode/code text extraction, embedded fonts, links, repeated headers and content beneath drawings. Clean and annotated text extraction matches; more than 98% of first-page pixel channels remain identical. Visual inspection includes the first page, a crossing stroke and the final page with its underlying content.
- PNG checks inspect full-document/selection overlay pixels, final-page notes, configured clean widths, A4 page dimensions (794 × 1123 at scale 1), and transparent backgrounds.
- Exported HTML is opened independently, resized and scrolled. Block geometry remains within one CSS pixel; fonts/assets are embedded and no external HTTP resources are requested.
- Rendered desktop, tablet and 320px mobile views were inspected. Reading-position regression tests use real editor scrolling and retained logical line positions when toolbars resize.

## Commands and artifacts

Final results: TypeScript checks and the production build passed; all 28 unit tests and all 47 headed Chrome acceptance tests passed. The separate reference-renderer suite passed both tests. The final build retains the existing large-chunk warning; the unconfigured local build also reports the optional analytics environment placeholder.

Run `npm run typecheck`, `npm run build`, `npm test`, and `npx playwright test --project=chrome-debug`. The headed project retains Playwright traces and a JSON report. `npm run test:reference` exercises the optional reference renderer separately.

Generated local evidence is under `output/playwright/`: `complete-annotated.pdf`, `complete-clean.pdf`, their extracted text and rendered images, `annotated-full.png`, `annotated-selection.png`, `annotated-last-page.png`, `browser-pages.zip`, `shared-surface.html`, `native-browser-zoom.json`, screenshots and acceptance traces. These are generated test artifacts, not source fixtures or deployed results.

The final complete acceptance traces are in `output/playwright/acceptance-complete/`; machine-readable results are in `output/playwright/test-results.json`. Obsolete repeated-run traces and disposable Chrome test profiles were removed to conserve local disk space. Final artifacts and the complete acceptance traces remain available.

## Boundaries

All production rendering and persistence remain in the browser; Cloudflare Pages can serve the static build. No rendering backend or external processing service was added. Final visual acceptance targets installed Chrome on Windows. Firefox and WebKit projects remain available but are not claimed as verified in this run. SVG/vector text and high-resolution regional fallbacks do not constitute a formal PDF/UA certification. Existing browser storage quota and export canvas/page/deadline safety limits remain; there is no document-count cap.
