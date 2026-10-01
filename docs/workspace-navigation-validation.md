# Workspace header and document navigation

Implemented and locally verified on 2026-10-01. Rename and Delete operate on the selected document, as requested; the workspace name remains Personal workspace.

## Findings and changes

Browser inspection reproduced the nearly unreadable document row in both themes. The sidebar's flex layout shrank its document scroll container below the row height (approximately 21–28 CSS pixels for a 40-pixel row). The truncation selector also targeted a nonexistent second span, allowing long titles to overflow.

The header now contains the workspace name, a document actions menu and the active-document picker. The picker supports searching, keyboard selection, a visible selected state, title truncation and full-name tooltips. Its searchable combobox references mounted listbox options even when the user scrolls away from the highlighted option. Escape and outside interactions dismiss popovers; Tab resumes the header's normal focus order. The menu exposes only Rename and Delete and retains the existing named-document deletion confirmation. Creation remains available through the existing + and Templates flows.

Sidebar and picker rows share one virtualized implementation. The viewport reserves space without flex shrinking and rounds its available height to complete rows. Icons, typography, explicit title truncation, selected styling and inset keyboard focus make each item readable. Keyboard navigation moves focus as well as selection, including across unmounted rows. Resizing keeps the active row visible. The narrow-screen sidebar uses the toolbar's measured height, including wrapping and auto-hide, instead of a viewport offset. Existing theme variables, Lucide icons, border radii and popover shadows are reused; no dependencies or persistence changes were introduced.

## Verification

- TypeScript check and static production build passed. The build retains its existing large-chunk warning.
- All 28 unit tests passed.
- Twenty-one distinct headed Chrome browser tests passed across verification runs: 10 multi-document/export regressions, 7 workspace-control regressions and 4 new navigation acceptance tests. The final navigation suite passed after the whole-row and resize refinements.
- Navigation coverage includes one and 1,000 documents; short and long names; search and empty results; arrow/Home/End/Enter/Tab/Escape keys; focus restoration; outside dismissal; rename persistence; canceled and confirmed deletion; last-document replacement; and active-row visibility after height changes.
- The 1,000-document keyboard/search/resize test also passed three consecutive headed runs after fixture isolation.
- Visual and geometry checks cover 1440, 1100, 768, 390 and 320 pixels in light and dark themes, with fixed header geometry when switching between short and long names. Scoped axe audits found no violations in the header, menus and document lists.
- Existing regressions verified five annotated documents with independent content, titles, settings and outlines; reloads; quota recovery; late rendering; legacy migration; stale-tab deletion; PDF, PNG and independent HTML export; device densities; preview zoom; drawing palette and toolbar auto-hide.

The initial browser run encountered a trace packaging error; the rerun retained valid traces. A later large-workspace test exposed a fixture race with pending welcome-document saves. Test seeding now happens on an inactive same-origin page after the initial save, so it cannot reinsert an obsolete fixture document. Neither issue required changing production persistence.

Screenshots are retained under `output/review/workspace-navigation-2026-10-01/`. Full headed traces and screenshots are in `C:/Users/Razib/AppData/Local/Temp/md-workspace-ui-20261001/`; large artifacts were kept off the storage-constrained G drive. No Git/GitHub writes or deployment were performed.
