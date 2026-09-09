export type Theme = "light" | "dark";
export interface DocumentSettings {
  escapedTableBreaks?: boolean;
  singleDollarMath: boolean;
  macros: Record<string, string>;
}
export interface Asset {
  path: string;
  data: string;
  mime: string;
  name: string;
}
export interface DocumentSnapshot {
  id: string;
  revision: number;
  source: string;
  settings: DocumentSettings;
  assets: Record<string, Asset>;
}
export interface Diagnostic {
  severity: "warning" | "error";
  code: string;
  line: number;
  message: string;
  action?: string;
}
export interface SourceBlock {
  id: string;
  start: number;
  end: number;
}
export interface RenderResult {
  html: string;
  blocks: SourceBlock[];
  outline: { id: string; text: string; level: number; line: number }[];
  diagnostics: Diagnostic[];
  resources: string[];
}
export interface ExportOptions {
  format: "pdf" | "png" | "html";
  theme: Theme;
  paper: "A4" | "Letter" | "Legal";
  landscape: boolean;
  margin: number;
  scale: number;
  width: number;
  background: "theme" | "transparent";
  pngMode: "document" | "pages" | "selection";
  selection?: string;
  allowWarnings: boolean;
  includeAnnotations?: boolean;
}
export interface ExportResult {
  id: string;
  token: string;
  revision: number;
  status: "complete" | "complete-with-warnings";
  artifacts: { name: string; mime: string; url: string }[];
  warnings: Diagnostic[];
}
export interface ExportAdapter {
  capabilities: readonly string[];
  preflight: (snapshot: DocumentSnapshot) => Promise<Diagnostic[]>;
  render: (
    snapshot: DocumentSnapshot,
    options: ExportOptions,
    signal?: AbortSignal,
  ) => Promise<ExportResult>;
}
export const defaultSettings: DocumentSettings = {
  singleDollarMath: true,
  macros: {},
};
export const defaultExportOptions: ExportOptions = {
  format: "pdf",
  theme: "light",
  paper: "A4",
  landscape: false,
  margin: 18,
  scale: 1,
  width: 1440,
  background: "theme",
  pngMode: "document",
  allowWarnings: false,
  includeAnnotations: false,
};
