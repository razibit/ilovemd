# Release roadmap

## Before a validated production release

1. Validate Docker/Linux sandbox operation and explicit host egress restrictions; exercise concurrent jobs, cancellation, TTL and sustained load under container limits.
2. Run screen-reader journeys with NVDA/Chrome and VoiceOver/Safari. Assess PDF reading order, structure tree, alt text and outlines with a dedicated accessibility checker. Do not claim PDF/UA on the strength of Chromium tagging.
3. Meet the original performance budgets on a documented four-core/8 GB reference machine with 100 KB + 100 equations + 20 images, 1 MiB stress cases, and thirty 20-page PDF runs. Existing automation timings are not INP measurements.
4. Strengthen source/preview mapping around nested columns, very tall images and large equations. Validate the one-line alignment target rather than assuming proportional interpolation always satisfies it.
5. Expand multilingual font coverage, especially CJK, complex bidirectional editing, IME and emoji across OSes. Latin/Bengali/Arabic fonts are bundled; other scripts currently depend on system fallback.
6. Exercise IndexedDB quota exhaustion and evicted/missing asset recovery across browser engines; add asset garbage collection and a durable backup reminder.

## Compatibility expansion

- Automatic equation numbering and references, bibliography/citations and richer document cross-references.
- A structured table extension for merged cells only after multi-page export tests pass.
- Video poster images, transparent page-image backgrounds, freeform region capture.
- JPEG/WebP adapters, then DOCX/EPUB proof-of-concept adapters with independent support matrices. Do not route the core PDF pipeline through them.
- True offline app-shell caching, local multi-document library and improved history navigation.
- Optional MathJax exploration if accessibility and compatibility evidence justify a second engine.

## Explicitly outside the current release

Cloud accounts/synchronization, live collaboration, arbitrary executable Markdown/MDX, arbitrary HTML/CSS/SVG, full LaTeX compilation, and AI-dependent editing/export. Any future AI assistance must be opt-in, reviewable, reversible and independent of deterministic rendering.
