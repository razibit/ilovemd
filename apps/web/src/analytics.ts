export const ANALYTICS = {
  gtmContainerId: "GTM-WXQLRTK4",
  ga4MeasurementId: "G-M95454PHMZ",
} as const;

export type AnalyticsEvent =
  | { event: "page_view"; page_path: string; page_title: string }
  | { event: "portfolio_link_impression" | "portfolio_link_click"; link_id: "owner_portfolio"; link_placement: "footer"; page_path: string }
  | { event: "tool_interaction"; feature: "workspace_view" | "interface_theme" | "document_theme" | "sync_scroll" | "annotation_tool"; action: string; page_path: string }
  | { event: "content_action"; action: "import_complete" | "paste_complete"; content_type: "markdown" | "bundle" | "image" | "text"; page_path: string }
  | { event: "export_started" | "export_completed" | "export_failed"; export_format: "pdf" | "png" | "html"; annotations_included: boolean; error_code?: string; page_path: string }
  | { event: "pwa_interaction"; action: "prompt_shown" | "accepted" | "dismissed" | "installed" | "instructions_shown"; page_path: string }
  | { event: "app_error"; feature: "render" | "export" | "import" | "storage" | "pwa"; error_code: string; page_path: string }
  | { event: "scroll_milestone"; percent_scrolled: 25 | 50 | 75 | 90; page_path: string };

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
    __ILOVEMD_ANALYTICS_ACTIVE__?: boolean;
    __ILOVEMD_ANALYTICS_DEBUG__?: Array<AnalyticsEvent>;
  }
}

export function publicPagePath(): string {
  const path = location.pathname.replace(/\/{2,}/g, "/");
  return path === "/privacy/" ? "/privacy" : path === "/" || path === "/privacy" ? path : "/";
}

type AnalyticsEventInput = AnalyticsEvent extends infer E
  ? E extends { page_path: string }
    ? Omit<E, "page_path"> & { page_path?: string }
    : never
  : never;

export function track(event: AnalyticsEventInput): void {
  const payload = { ...event, page_path: event.page_path ?? publicPagePath() } as AnalyticsEvent;
  window.__ILOVEMD_ANALYTICS_DEBUG__?.push(payload);
  if (!window.__ILOVEMD_ANALYTICS_ACTIVE__) return;
  try { window.dataLayer?.push(payload); } catch { /* Analytics must never interrupt the workspace. */ }
}

export function errorCode(value: unknown): string {
  const text = String(value).toLowerCase();
  if (text.includes("abort")) return "request_aborted";
  if (text.includes("network") || text.includes("fetch")) return "network_failure";
  if (text.includes("integrity")) return "integrity_failure";
  if (text.includes("storage") || text.includes("indexeddb")) return "storage_failure";
  if (text.includes("timeout")) return "timeout";
  return "operation_failure";
}

export function trackInitialPageView(): void {
  track({ event: "page_view", page_title: document.title.slice(0, 100) });
}
