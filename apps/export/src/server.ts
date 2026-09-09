import type { AnnotationExportPayload } from '../../../packages/engine/src/annotations';
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { randomUUID, timingSafeEqual,createHash } from "node:crypto";
import { resolve } from "node:path";
import { createArtifacts, PreflightError, closeRenderer } from "./render";
import {
  defaultExportOptions,
  type DocumentSnapshot,
  type ExportOptions,
} from "@folio/engine";
const app = Fastify({ logger: false, bodyLimit: 75 * 1024 * 1024 });
app.addHook('onSend',async(_req,reply,payload)=>{reply.header('X-Content-Type-Options','nosniff').header('Referrer-Policy','no-referrer').header('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https: http:; worker-src 'self' blob:; frame-src https://www.youtube-nocookie.com https://player.vimeo.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");return payload});
const port = Number(process.env.PORT || 4174);
const host = process.env.HOST || "127.0.0.1";
if (
  !["127.0.0.1", "localhost"].includes(host) &&
  !process.env.FOLIO_ACCESS_TOKEN
)
  throw new Error(
    "Public binding requires FOLIO_ACCESS_TOKEN and a TLS access gateway.",
  );
const origins = new Set(
  (
    process.env.FOLIO_ORIGINS ||
    `http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:${port},http://localhost:${port}`
  ).split(","),
);
const jobs = new Map<
  string,
  {
    token: string;
    artifacts: { name: string; mime: string; bytes: Buffer }[];
    expires: number;
  }
>();
let active = 0;
const buckets = new Map<string, { count: number; until: number }>();
const cleanup = setInterval(() => {
  for (const [id, job] of jobs) if (job.expires < Date.now()) jobs.delete(id);
  for (const [ip, b] of buckets) if (b.until < Date.now()) buckets.delete(ip);
}, 30000);
cleanup.unref();
app.addHook("onRequest", async (req, reply) => {
  const allowedHosts = new Set(
    [...origins].map((origin) => new URL(origin).host),
  );
  if (!allowedHosts.has(req.headers.host ?? "")) {
    reply.code(403).send({ error: "Host not allowed" });
    return;
  }
  if (!req.url.startsWith("/api/")) return;
  reply
    .header("Cache-Control", "no-store")
    .header("X-Content-Type-Options", "nosniff");
  if (req.headers.origin && !origins.has(req.headers.origin)) {
    reply.code(403).send({ error: "Origin not allowed" });
    return;
  }
  if (req.headers["sec-fetch-site"] === "cross-site") {
    reply.code(403).send({ error: "Cross-site requests are not allowed" });
    return;
  }
  if (
    process.env.FOLIO_ACCESS_TOKEN &&
    req.headers.authorization !== `Bearer ${process.env.FOLIO_ACCESS_TOKEN}`
  ) {
    reply
      .code(401)
      .send({ error: "Configure your export access token in Settings." });
    return;
  }
});
app.get("/api/health", () => ({
  status: "ok",
  processing: "Self-hosted export service",
  active,
  retentionMinutes: 10,
}));
app.post("/api/exports", async (req, reply) => {
  const bucket = buckets.get(req.ip);
  if (bucket && bucket.until > Date.now() && bucket.count >= 20)
    return reply
      .code(429)
      .send({ error: "Export rate limit reached. Try again in one minute." });
  buckets.set(req.ip, {
    count: (bucket && bucket.until > Date.now() ? bucket.count : 0) + 1,
    until:
      bucket && bucket.until > Date.now() ? bucket.until : Date.now() + 60000,
  });
  if (active >= 2 || jobs.size >= 20)
    return reply
      .code(429)
      .send({ error: "Export service is busy. Try again shortly." });
  const body = req.body as {
    snapshot: DocumentSnapshot;
    options: ExportOptions;
    annotations?: AnnotationExportPayload;
  };
  if (
    !body?.snapshot ||
    typeof body.snapshot.source !== "string" ||
    !body.snapshot.assets ||
    !body.snapshot.settings ||
    typeof body.snapshot.settings.singleDollarMath !== "boolean"
  )
    return reply.code(400).send({ error: "Invalid document snapshot." });
  const options = { ...defaultExportOptions, ...body.options };
  if (
    !["pdf", "png", "html"].includes(options.format) ||
    !["light", "dark"].includes(options.theme) ||
    !["A4", "Letter", "Legal"].includes(options.paper) ||
    !["document", "pages", "selection"].includes(options.pngMode) ||
    !["theme", "transparent"].includes(options.background) ||
    typeof options.landscape !== "boolean" ||
    typeof options.allowWarnings !== "boolean" ||
    typeof options.includeAnnotations !== "boolean" ||
    ![options.margin, options.scale, options.width].every(Number.isFinite) ||
    options.margin < 5 ||
    options.margin > 50 ||
    options.scale < 0.25 ||
    options.scale > 2 ||
    options.width < 320 ||
    options.width > 4096
  )
    return reply.code(400).send({ error: "Invalid export options." });
  active++;
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 60000);
  reply.raw.on("close", () => {
    if (!reply.raw.writableFinished) controller.abort();
  });
  try {
    const { artifacts, warnings } = await createArtifacts(
      body.snapshot,
      options,
      controller.signal,
      body.annotations ? { ...body.annotations, snapshot: body.annotations.snapshot ?? body.snapshot } : undefined,
    );
    const retained = [...jobs.values()].reduce(
      (sum, job) => sum + job.artifacts.reduce((n, a) => n + a.bytes.length, 0),
      0,
    );
    if (
      retained + artifacts.reduce((n, a) => n + a.bytes.length, 0) >
      128 * 1024 * 1024
    )
      return reply
        .code(429)
        .send({
          error:
            "Artifact storage is full. Release earlier exports or try again later.",
        });
    const id = randomUUID();
    const token = randomUUID();
    jobs.set(id, { token, artifacts, expires: Date.now() + 600000 });
    return {
      id,
      token,
      revision: body.snapshot.revision,
      status: warnings.length ? "complete-with-warnings" : "complete",
      warnings,
      artifacts: artifacts.map((a, i) => ({
        name: a.name,
        mime: a.mime,
        url: `/api/exports/${id}/${i}`,
      })),
    };
  } catch (e) {
    if (e instanceof PreflightError)
      return reply
        .code(422)
        .send({ error: e.message, diagnostics: e.diagnostics });
    return reply
      .code(400)
      .send({ error: e instanceof Error ? e.message : "Export failed." });
  } finally {
    clearTimeout(deadline);
    active--;
  }
});
app.get<{ Params: { id: string; index: string } }>(
  "/api/exports/:id/:index",
  async (req, reply) => {
    const job = jobs.get(req.params.id);
    const token = String(req.headers["x-export-token"] || "");
    if (
      !job ||
      job.expires < Date.now() ||
      !/^[0-9a-f-]{36}$/i.test(token) ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(job.token))
    )
      return reply
        .code(404)
        .send({ error: "Export expired or token is invalid." });
    const asset = job.artifacts[Number(req.params.index)];
    if (!asset) return reply.code(404).send({ error: "Artifact not found" });
    if(req.headers.accept==='application/json')return {name:asset.name,mime:asset.mime,byteLength:asset.bytes.length,sha256:createHash('sha256').update(asset.bytes).digest('hex'),data:asset.bytes.toString('base64')};
    return reply
      .type(asset.mime)
      .header("Content-Disposition", `attachment; filename="${asset.name}"`)
      .send(asset.bytes);
  },
);
app.delete<{ Params: { id: string } }>(
  "/api/exports/:id",
  async (req, reply) => {
    const job = jobs.get(req.params.id);
    if (job && req.headers["x-export-token"] === job.token)
      jobs.delete(req.params.id);
    return reply.code(204).send();
  },
);
await app.register(fastifyStatic, {
  root: resolve(import.meta.dirname, "../../web/dist"),
});
app.setNotFoundHandler((req, reply) =>
  req.url.startsWith("/api/")
    ? reply.code(404).send({ error: "Not found" })
    : reply.sendFile("index.html"),
);
await app.listen({ port, host });
console.log(`Folio export service: http://${host}:${port}`);
for (const event of ["SIGINT", "SIGTERM"] as const)
  process.on(event, async () => {
    clearInterval(cleanup);
    await closeRenderer();
    await app.close();
    process.exit(0);
  });
