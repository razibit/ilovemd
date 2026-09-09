# Newline and diagram repair — 2026-09-09

## 1. Executive summary

The supplied report contains literal U+005C U+006E characters in table cells, not LF characters. Table prose now renders a single unescaped sequence as a hard break. Markdown source is preserved.

Diagram overflow was reproduced with a three-node flowchart. Sanitization deleted Mermaid's `text-anchor: middle` stylesheet rule. Text consequently started at the node center rather than being centered there. Retaining safe layout presentation attributes before removing CSS fixes the shared preview/export path.

## 2. Literal newline investigation

Reproduction: report line 47 contains `**Meta Commerce / Shops education**  \nhttps://www.facebook.com/...` inside a GFM table cell. The original bytes contain backslash followed by n. Import uses `file.text()`, persistence uses structured cloning/IndexedDB, and export uses JSON snapshots. LF/CRLF and JSON regression fixtures confirm those paths preserve real newlines and literal escapes.

The previous text-node regex replaced literal `\n` before `http` with whitespace. This could destroy intentional text and occurred too late for autolinking: GFM may already have parsed `nhttps` as plain text.

The replacement is an explicit table-cell AST extension:

1. A literal single-backslash `\n` in table prose is rendered automatically as a semantic hard break, including before an absolute URL.
2. This also handles GFM's split-token form, where `\nhttps://` is text and `www…` is already an autolink without source positions.
3. Inline-code spans and doubled backslashes remain literal, so code samples and explicitly escaped data are preserved.
4. Preserve source exactly. The transformation is only applied to the rendered table-cell tree.

This is a compatibility extension, not standard CommonMark behavior. Ordinary LF remains a soft break unless explicit hard-break syntax applies. A real newline inside a GFM table row is not a portable cell-break syntax.

## 3. Diagram overflow investigation

The minimal flowchart contains short, medium and long rectangular labels. All three failed containment before repair. For `Handle availability confirmed`, node bounds were x=934.31, width=411.37; text began at x=1139.99 with width=311.09. After repair it begins at x=984.45 with the same width and fits with padding.

A font-only change failed to fix containment, isolating the missing anchor as the main fault. The runtime now parses generated CSS without attaching it to the DOM and retains only inert text-anchor, baseline, font-size, font-weight and font-style presentation attributes. Inline declarations are transferred afterward. Existing sanitization still removes stylesheets, inline CSS, scripts, links and foreign objects.

DM Sans 400 at 14px is explicitly loaded before layout. Scoped diagram typography uses the same metrics independently of document font controls. Mermaid wraps text, sizes nodes and positions the graph before serialization; no clipping or post-layout wrapping was introduced. The installed engine wraps the long unbroken-label and URL fixtures. See Mermaid's official label documentation: https://mermaid.js.org/syntax/flowchart.html.

The regenerated supplied report has three diagrams, 44 table breaks and 38 table links. All 57 inspected rectangular labels pass containment; export diagnostics are empty.

## 4. Code changes

| File | Change |
| --- | --- |
| `packages/engine/src/index.ts` | Converts single unescaped literal-newline sequences in table prose into rendered hard breaks before inline parsing, including GFM split URL tokens. |
| `apps/web/src/diagrams.ts` | Explicit font loading; safe SVG layout attributes retained before sanitization. |
| `packages/themes/document.css` | Diagram font metrics isolated from document controls. |
| `tests/engine.test.ts` | LF/CRLF, JSON, literal escapes, code, links and table-break tests. |
| `tests/e2e/rendering-regression.spec.ts` | Native paste, import, settings, views, recovery and responsive/theme/zoom containment. |
| `tests/export.test.ts` | Real light/dark HTML, PDF, PNG; text extraction and serialized SVG bounds. |
| `tests/rendering-regression.ts` | Shared mixed-content and branching-graph fixtures. |

Relevant before/after:

```ts
// Removed: silently replacing literal source characters after parsing.
node.value = node.value.replace(/\\n(?=https?:\/\/)/g, " ");

// Now: the scoped table-cell AST path normalizes only rendered prose.
// The cell is reparsed so links and inline Markdown retain their semantics.
normalized += "  \n";

// Preserve inert SVG geometry attributes before removing generated CSS.
for (const element of parsed.querySelectorAll(rule.selectorText))
  transfer(element, rule.style);
```

## 5. Verification matrix

Pass refers only to the tested fixtures.

| Scenario | Preview | PDF | PNG | Standalone HTML |
| --- | --- | --- | --- | --- |
| Actual newline before URL | Pass | Pass | Pass | Pass |
| Literal backslash+n in code | Pass | Pass | Pass | Pass |
| Automatic table-prose breaks | Pass | Pass | Pass | Pass |
| Long/unbroken/URL diagram labels | Pass: bounds | Pass: raster/extraction | Pass: raster | Pass: bounds |
| Fonts settled before layout | Pass | Pass | Pass | Pass |
| 390/768/1440px widths | Pass | Fixed A4 tested | Fixed 1000px tested | Pass |
| Light/dark themes | Pass | Pass | Pass | Pass |
| 100%/125% CSS zoom, document font 24px | Pass | N/A | N/A | Not separately tested |

TypeScript, production build, all 20 engine/export tests, and the full 16-test Chromium suite pass. Two new journeys additionally passed in headed Chrome with DevTools, Firefox and WebKit (six runs). Native clipboard permissions and Ctrl+V were tested in Chromium. WebKit is not a universal Safari claim.

Both mixed-content PDFs have two A4 pages, extracted fixture text and labels, tagging, and no JavaScript. The first light PDF page and both themes' diagram page 2 were visually inspected, together with the dark PNG. HTML geometry was measured at three widths. PDF print layout deliberately moves the intact graph to page 2.

Evidence:

- `output/rendering-tests.log`: 20/20.
- `output/chromium-regression.log`: 16/16, including native paste and earlier synchronization/export journeys.
- `output/label-original.png` and `.json`: failing minimal graph.
- `output/label-before.png` and `.json`: corrected rerun of that same graph (historical script filename).
- `output/label-after.png`: corrected expanded branching fixture.
- `output/rendering/`: actual HTML/PDF/PNG, PDF rasters, text extraction and real-report bounds.
- `C:/Users/Razib/Downloads/document-rendering-fixed.html`: repaired supplied report using automatic table-break compatibility. Originals were not overwritten.

## 6. Remaining risks

- [FILL: original_screenshot_files]. Only the pasted text attachment was supplied for this request; the original report and local reproductions supplied the evidence.
- Table prose uses automatic interpretation of a single unescaped literal `\n`. Outside-table literal escapes, inline code, and doubled escapes remain preserved.
- CSS zoom was tested; browser chrome zoom and every device-pixel ratio were not.
- Rectangular flowchart nodes are covered. All shape families, arbitrary custom styles and rich/bold label combinations remain outside this repair's exhaustive evidence.
- Dark PDF margins remain white. PDF/UA conformance is unchanged and unverified.
