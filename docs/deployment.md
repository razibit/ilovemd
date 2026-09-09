# Deployment and operational boundaries

## Local installation

`npm ci`, `npx playwright install chromium`, `npm run build`, then `npm start`. The service binds to loopback by default and serves both the built application and API. `npm run dev` starts Vite on 5173 and the export service on 4174. Do not run a second service on the same port.

Ports can be changed through `PORT`; update Vite's proxy and `FOLIO_ORIGINS` if using non-default development ports. The service reads process environment variables, not `.env` files automatically. Vite reads its standard `.env.local` file within `apps/web` for `VITE_PORTFOLIO_URL` and `VITE_ANALYTICS_MODE`. See [analytics, privacy and reporting](analytics-seo.md) before enabling collection.

## Container packaging

The Dockerfile builds the frontend, installs Chromium system dependencies, and runs as the non-root `node` user. The browser sandbox is enabled on Linux. Chromium needs an environment that permits its sandbox/user namespaces. A failure to launch should be resolved at the container runtime; do not silently disable the sandbox for a public service.

The installed Docker CLI was available during development, but Docker Desktop's Linux engine was not running. Therefore **container build, Linux sandbox operation and container smoke tests remain unverified**.

## Cloudflare static site with an Azure export origin

The production Worker serves `apps/web/dist` and routes only the documented
`/api/*` methods to `EXPORT_ORIGIN`. Store `FOLIO_ACCESS_TOKEN` with
`wrangler secret put`; never put it in `wrangler.json` or browser storage. The
origin is expected to require that bearer token and to accept
`https://ilovemd.tech` as an allowed origin.

The zero-cost reference deployment uses one free-eligible Linux burstable VM,
one free-eligible 64 GiB OS disk, no public IP, and a named Cloudflare Tunnel.
Azure Cost Management budgets are delayed alerts, not hard spending caps.
Before provisioning, verify the subscription's free-service page still shows
remaining VM and disk allowances plus their expiry. Configure
`FOLIO_MAX_CONCURRENCY=1` on a 1 GiB host and deallocate rather than resize if
the representative export workload does not fit.

For Azure for Students, the documented free VM allowance is 750 hours each of
`Standard_B1s`, `Standard_B2pts_v2`, and `Standard_B2ats_v2`; the allowance is
separate from the subscription's $100 credit. The subscription spending-limit
flag may still be `Off`, so this deployment also requires a resource-group
budget, an allowed-SKU policy restricted to `Standard_B1s`, and a positive
free-benefit check before allocation. If Azure reports `SkuNotAvailable`, do
not substitute a paid SKU: leave the resource group empty and retry capacity
later.

The origin VM must not enable Azure Backup, paid Defender plans, Log Analytics,
snapshots, additional disks, a NAT Gateway, or a load balancer. A non-private
subnet can provide Azure's nondeterministic default outbound path for the
outbound-only tunnel; there is intentionally no inbound NSG rule. Operators
who require deterministic egress must use a paid explicit outbound product.

When a working Docker engine is available:

```text
docker build -t folio-local .
docker run --rm --init -p 127.0.0.1:4174:4174 --memory=2g --cpus=2 --shm-size=512m -e FOLIO_ACCESS_TOKEN=<random-secret> -e FOLIO_ORIGINS=http://127.0.0.1:4174 folio-local
```

Supply secrets through the operator's secret mechanism. Enter the matching access token in Settings; it is held only in sessionStorage. The example publishes the container on loopback. For public hosting, place it behind a TLS authentication/access gateway, define exact allowed origins/hosts, enforce host-level egress controls and per-user quotas, and validate those controls before release. Document and asset contents are not logged.

## Resource and lifecycle controls

- 2 MiB source, 10 MiB per image, 50 MiB decoded asset payload total, 500 assets, 32 MP decoded image limit.
- 75 MiB HTTP body limit accounts for base64 expansion. No remote server asset fetching.
- One concurrent export by default; `FOLIO_MAX_CONCURRENCY` can raise this to two on a sufficiently sized host. Overload returns 429. Twenty export requests per minute per direct client IP.
- Parsing: separate worker, 256 MiB old-generation budget and ten-second timeout. Job: sixty-second cancellation deadline.
- PNG output: 32 MP / 16,384-pixel dimension cap per capture, maximum 200 PDF page images, 64 MiB artifact cap.
- At most twenty retained jobs and 128 MiB retained artifacts. Browser download releases the server copy. Abandoned jobs expire after ten minutes; cleanup runs every thirty seconds.
- Memory-only artifacts disappear on service restart. No permanent server document store or database is used.

The current implementation uses fresh browser contexts in a shared Chromium process, not a hardened multi-tenant browser farm. Deploy in a dedicated container/VM; OS compromise containment, load testing, external penetration testing, TLS and authenticated public operation remain release gates.

## Monitoring

`GET /api/health` reports process health and active exports. Protect it with the same configured API token. Monitor process memory, 4xx/5xx rates, render duration, restarts and queue rejection counts at the gateway without logging request bodies. The frontend has an allowlisted GTM data-layer integration. Analytics is disabled by default and never receives document content.

Backups are user-created Markdown bundles. IndexedDB is not a substitute for durable backup or cloud synchronization. Asset garbage collection and encrypted local storage are future work.
