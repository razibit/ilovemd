# Preview navigation and annotations

The preview has a dedicated bottom navigation row. Zoom applies to the document and SVG notes together, not the application. The slider, its hover-wheel interaction, reading-settings zoom, and touchpad pinch share one state. Default limits are 25–400% in `ZOOM_LIMITS`.

Use **Hand** to drag the page or hold **Space** temporarily while the preview is active. Ordinary wheel/touchpad scrolling remains native. **100%** and **Fit width** restore a reachable page position. Navigation uses bounded scroll offsets and suppresses feedback into synchronized scrolling during zoom adjustments.

## Drawing

**Annotate** enables pointer interception; disabling it restores document text selection and links. Tools include pen, marker, highlighter, underline, line, arrow, rectangle, ellipse, selection and a whole-object eraser. Click an object with the eraser to remove it.

- Select an object to move it, drag its bottom-right handle to resize, or use **Delete selected**. Arrow keys nudge by one document pixel; Shift increases the step to ten.
- Color, width and opacity update the selected object or configure the next stroke. Highlighter opacity is capped at 45%.
- **Undo note** and **Redo note** are separate from Markdown undo. Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z and Ctrl/Cmd+Y work when the drawing layer has focus.
- Smoothing is adjustable down to zero. Shift constrains strokes/lines to 45-degree angles and rectangles/ellipses to squares/circles. Endpoint/angle snapping is optional and disabled initially.
- Pointer coalescing, animation-frame updates, vector rendering and pen pressure avoid device-pixel or zoom-dependent drawing coordinates. Physical stylus and touchpad behavior still requires testing on those devices.

## Frozen revisions and saving

Starting annotations freezes the settled document width, typography, padding, responsive column layout and source-block geometry. View changes and workspace resizing do not reflow the annotated page. Interactive video embeds become static links to match exports.

Markdown, asset or reading-layout changes keep notes with their original revision. A notice provides **Review preserved notes** and explicit **Adopt onto current layout**. Adoption copies editable objects into a new set; the original remains stored. Positions may require manual adjustment after adoption. Local history restores document identity and its matching annotation set.

IndexedDB database `folio` version 3 stores annotation sets separately from document heads/history and reuses the asset store. New/imported documents and template replacements receive new IDs. Importing the same Markdown file again intentionally creates a separate document.

Saves are debounced and serialized with version checks. Save failures remain visible, offer retry and JSON backup, and retain unsaved sets in memory across document switches. Unsaved data triggers a leave-page warning. Browser-data deletion/eviction can still remove local notes; Markdown and existing source/asset bundles do not contain annotations. The annotation JSON backup contains editable objects and their snapshot.

## Exports

**Include annotations** defaults off. Enabling it sends the editable annotation set with the export request. The service validates it, regenerates the saved snapshot, verifies block positions, and uses the same SVG shapes as the preview. A stale set requires an explicit choice to export the preserved revision.

- Full PNG captures the complete frozen document. PNG scale controls raster resolution; document width is fixed while annotations are included.
- Selection PNG clips the document and overlay together to the selected source block.
- PDF and page PNG fit the frozen layout to the printable width and clip identical document/overlay regions into pages. Page edges may split text or shapes; use the generated preview to inspect boundaries. PDF scale is fixed for this path.
- Annotated HTML preserves fixed page width and vector notes. Clean exports retain the existing responsive/print pipeline.

Exports never depend on current preview zoom, scroll or pan. Unsupported or changed resource geometry produces an explicit export error rather than silently relocating notes. Limits are 10,000 annotation objects, 200,000 points and the existing export size/page limits.

## Verification commands

```powershell
npm run typecheck
npm run build
npm test
npx playwright test --project=chromium
npx playwright test tests/e2e/annotations.spec.ts --project=chrome-debug
```

The headed Chrome configuration opens DevTools and retains traces. Tests use full-document keyboard replacement because CodeMirror's virtualized DOM makes generic `fill()` unreliable. Artifacts are written under `output/playwright/`.
