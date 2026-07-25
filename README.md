# WhatsLocal

A city-wide **local search engine / yellow pages** + jobs directory. Starts with Gondia, expands city by city via user submissions + admin approval.

> The project/brand name is centralized in [`brand.config.json`](brand.config.json). Rename there and everything follows. Full docs in [`docs/`](docs/README.md).

## Stack
pnpm + Turbo monorepo · NestJS 10 + Mongoose 8 (`apps/backend`) · React 18 + Vite 5 + Tailwind (`apps/web`) · shared `@whatslocal/types` (`packages/types`). Same Atlas cluster as RG ERP, own database `whatslocal2_0`.

## Toolchain (this machine)
Node/pnpm aren't installed system-wide — they live in RG ERP's `.tools`. Prepend to PATH first (PowerShell):
```powershell
$env:PATH = "E:\DATA\DESKTOP\retailgrid\RetailGrid ERP\.tools;" + $env:PATH
```

## Install
```powershell
$env:CI = "true"
pnpm install --prefer-offline --config.confirm-modules-purge=false
pnpm rebuild esbuild @nestjs/core      # one-time: run skipped build scripts
pnpm --filter @whatslocal/types build  # build shared types
```

## Run (dev)
```powershell
# Terminal A — API on http://localhost:9100/api/v1
pnpm --filter @whatslocal/backend dev

# Terminal B — web on http://localhost:5180 (proxies /api → backend)
pnpm --filter @whatslocal/web dev
```

## Verify
- `GET http://localhost:9100/api/v1/health` → `{ ok, db: { name: "whatslocal2_0", state: 1 } }`
- `GET http://localhost:9100/api/v1/utility/pin-lookup/441601` → Gondia, Maharashtra
- `GET http://localhost:9100/api/v1/analytics/summary` → visitors / searches / zero-result searches

## Build (prod)
```powershell
pnpm build   # builds types → backend (dist) + web (dist)
```
