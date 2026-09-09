interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  EXPORT_ORIGIN: string;
  FOLIO_ACCESS_TOKEN: string;
}

const exportArtifact = /^\/api\/exports\/[0-9a-f-]{36}\/\d+$/i;
const exportJob = /^\/api\/exports\/[0-9a-f-]{36}$/i;

function allowedMethod(pathname: string, method: string) {
  if (pathname === "/api/health") return method === "GET";
  if (pathname === "/api/exports") return method === "POST";
  if (exportArtifact.test(pathname)) return method === "GET";
  if (exportJob.test(pathname)) return method === "DELETE";
  return false;
}

function jsonError(status: number, code: string, error: string) {
  return Response.json(
    { error, code },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function proxyRequest(
  request: Request,
  env: Env,
  fetcher: typeof fetch = fetch,
) {
  const incoming = new URL(request.url);
  if (!incoming.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
  if (!allowedMethod(incoming.pathname, request.method)) {
    return jsonError(405, "API_METHOD_NOT_ALLOWED", "Method not allowed");
  }
  if (!env.EXPORT_ORIGIN || !env.FOLIO_ACCESS_TOKEN) {
    return jsonError(
      503,
      "EXPORT_SERVICE_UNAVAILABLE",
      "The export service is not configured.",
    );
  }

  const upstream = new URL(incoming.pathname + incoming.search, env.EXPORT_ORIGIN);
  const headers = new Headers(request.headers);
  headers.set("Authorization", `Bearer ${env.FOLIO_ACCESS_TOKEN}`);
  headers.set("Origin", new URL(request.url).origin);
  headers.delete("CF-Connecting-IP");
  headers.delete("X-Forwarded-For");

  try {
    const init: RequestInit & { duplex?: "half" } = {
      method: request.method,
      headers,
      body: request.body,
      redirect: "manual",
    };
    if (request.body) init.duplex = "half";
    const response = await fetcher(
      new Request(upstream, init),
    );
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("Cache-Control", "no-store");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch {
    return jsonError(
      503,
      "EXPORT_SERVICE_UNAVAILABLE",
      "The export service is temporarily unavailable. Please try again shortly.",
    );
  }
}

export default {
  fetch(request: Request, env: Env) {
    return proxyRequest(request, env);
  },
};
