# iLoveMd.tech analytics, privacy, SEO and reporting

## Deployment modes

GTM container `GTM-WXQLRTK4` is the only analytics loader. GA4 measurement ID `G-M95454PHMZ` must be configured inside GTM; do not add standalone `gtag.js`. The head bootstrap fails closed. The `noscript` iframe is deliberately omitted because static markup cannot honor the selected privacy mode and would bypass its loading restriction.

`VITE_ANALYTICS_MODE` accepts `disabled` (or unset), `anonymous`, or `consent`. Disabled is the development/test default. Use `anonymous` only after the operator documents that no consent gate is required and turns off advertising personalization. `consent` loads only when `localStorage['ilovemd.analytics-consent']` is `granted` by a separately implemented, legally valid consent UI; Consent Mode does not itself obtain consent.

Set `VITE_PORTFOLIO_URL` to the real owner-controlled portfolio URL. It is currently a deployment dependency. Cross-domain lead measurement additionally requires control and compatible GTM/GA4 configuration on both sites plus a server-confirmed successful contact action. Until then, portfolio clicks are referral intent and `generate_lead` must not fire.

## GTM configuration

Create one GA4 Google tag for `G-M95454PHMZ`. Disable automatic page views and history page views because the application sends one explicit `page_view`. Review Enhanced Measurement individually: disable outbound clicks, site search, form interactions, file downloads and automatic scrolls here to prevent overlap or user-authored data exposure. Do not enable User-ID, Google Signals, advertising personalization or user-provided-data collection.

Create Custom Event triggers for the allowlisted events below and map only the listed parameters. Publish only after GTM Preview proves one startup page view, no render/editor page views and no content-bearing fields. Mark `generate_lead` as a GA4 key event only when a genuine successful contact action exists.

| Event | Trigger and parameters | Deduplication | Purpose | Key event |
| --- | --- | --- | --- | --- |
| `page_view` | startup; `page_path`, `page_title` | once per load | visits/landing pages | No |
| `portfolio_link_impression` | 50% of configured footer link visible for one continuous second in a visible tab; `link_id`, `link_placement`, `page_path` | once per placement/page view | qualified exposure | No |
| `portfolio_link_click` | genuine anchor activation; same parameters | one click per activation | referral intent | No |
| `tool_interaction` | completed view/theme/sync/tool choice; `feature`, `action`, `page_path` | completed choices only | feature adoption | No |
| `content_action` | successful import or image paste; `action`, `content_type`, `page_path` | after success | content workflow without content | No |
| `export_started` | request begins; `export_format`, `annotations_included`, `page_path` | once/request | demand | No |
| `export_completed` | verified artifact received; same parameters | once/verified request | success | No |
| `export_failed` | failed request/integrity check; same plus `error_code` | once/failure | reliability | No |
| `pwa_interaction` | prompt shown, accepted, dismissed, installed or instructions shown; `action`, `page_path` | browser event/choice | install funnel | No |
| `app_error` | allowlisted `feature`, normalized `error_code`, `page_path` | per surfaced failure | sanitized diagnostics | No |
| `scroll_milestone` | reserved for public non-editor pages; `percent_scrolled`, `page_path` | once/milestone/load | engagement | No |
| `generate_lead` | verified successful portfolio contact submission only | once/confirmed success | genuine lead | Yes, when implemented |

The typed helper accepts no document strings, filenames, titles, arbitrary URLs, referrers, form values or raw errors. `page_path` reduces to `/` or `/privacy` and excludes query/hash. Debug without traffic by setting `window.__ILOVEMD_ANALYTICS_DEBUG__ = []` before actions while analytics mode is disabled.

## GA4 reports

Register `link_id`, `link_placement`, `feature`, `action`, `export_format`, `annotations_included`, `error_code` and `page_path` as event-scoped custom dimensions where needed.

Portfolio exploration: filter to the two portfolio events; show event totals and distinct measured users/sessions, broken down by placement. Session click-through rate is `sessions with a qualified impression followed by a click / sessions with a qualified impression × 100`, using matching dates and placement filters. A user-based rate uses measured users in both numerator and denominator; measured users are not exact people.

Referral funnel: closed, session-scoped ordered steps `page_view` → `portfolio_link_impression` → `portfolio_link_click`; add `generate_lead` only after downstream success is measured. Acquisition/product exploration: source, medium, campaign, sanitized landing page and device category against feature use and export outcomes. Error exploration: `app_error`/`export_failed` by feature/code, never raw messages.

## SEO and external setup

The build contains canonical/social metadata, `WebSite` and `WebApplication` JSON-LD, crawlable initial copy, `/privacy/`, `robots.txt`, `sitemap.xml`, a noindex 404 document, manifest and branded assets. Configure hosting to redirect HTTP to HTTPS, `www.ilovemd.tech` to `ilovemd.tech`, and noncanonical trailing-slash variants. Unknown paths must return HTTP 404 instead of the SPA fallback before indexing.

In Search Console, create and verify the `ilovemd.tech` domain property using Google's supplied DNS TXT token, then submit `https://ilovemd.tech/sitemap.xml`. Inspect both canonical URLs and request indexing only after production status codes/content/canonicals are correct. Validate JSON-LD in Schema Markup Validator/Rich Results Test; validity does not guarantee rich-result eligibility.
