# External Integrations

**Analysis Date:** 2026-05-29

## APIs & External Services

**Backend Platform:**
- Appwrite Cloud/Self-hosted - core account/users/tables and webhook ecosystem.
  - SDK/Client: `node-appwrite` (`src/common/appwrite/appwrite.provider.ts`).
  - Auth: `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT`, `APPWRITE_API_KEY` (`src/common/appwrite/constants.ts`).

**Game Data:**
- IGDB API + Twitch OAuth token endpoint for machine auth.
  - SDK/Client: native `fetch` (`src/modules/igdb/igdb.service.ts`).
  - Auth: `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET`; webhook secret `IGDB_WEBHOOK_SECRET` (`src/common/guards/igdb.guard.ts`).

**AI Providers:**
- OpenAI-compatible provider via Genkit plugin.
  - SDK/Client: `@genkit-ai/compat-oai` + `genkit` (`src/common/ai/ai.module.ts`).
  - Auth: `OPENAI_KEY`.
- Google GenAI via Genkit.
  - SDK/Client: `@genkit-ai/google-genai` + `genkit` (`src/common/ai/ai.module.ts`).
  - Auth: `GOOGLE_GENAI_KEY`.

**Content/Media:**
- YouTube Data API for search.
  - SDK/Client: `googleapis` (`src/modules/google/youtube.service.ts`).
  - Auth: `GOOGLE_API_KEY`.
- Unsplash image search (HTTP calls inside AI/editor and sandbox flows).
  - SDK/Client: native `fetch` (`src/common/ai/agents/editor/editor.service.ts`, `src/modules/sandbox/sandbox.service.ts`).
  - Auth: `UNSPLASH_ACCESS_KEY`.

**Messaging/Notifications:**
- Evolution API (WhatsApp delivery bridge).
  - SDK/Client: native `fetch` (`src/modules/notifications/evolution.service.ts`).
  - Auth: `EVOLUTION_ENDPOINT`, `EVOLUTION_INSTANCE_TOKEN`.

## Data Storage

**Databases:**
- Appwrite TablesDB (`app` database and multiple tables defined in `appwrite.config.json`).
  - Connection: `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT`, `APPWRITE_API_KEY`.
  - Client: `node-appwrite` `TablesDB`.

**File Storage:**
- Appwrite Storage service enabled in `appwrite.config.json`.

**Caching:**
- In-process cache-manager (no Redis/Memcached detected) (`src/app.module.ts`).

## Authentication & Identity

**Auth Provider:**
- Appwrite (server-side API key client and session/account checks).
  - Implementation: `Client` + `Account` + `Users` in `src/common/appwrite/appwrite.provider.ts` and guards in `src/common/guards/session.guard.ts`.

## Monitoring & Observability

**Error Tracking:**
- No external SaaS tracker detected.

**Logs:**
- Nest `ConsoleLogger` with JSON output configured in `src/main.ts`; service-level `Logger` usage across modules.

## CI/CD & Deployment

**Hosting:**
- Node service deployment target not pinned in repo; app exposes HTTP server via Nest (`src/main.ts`).
- Appwrite Functions deployment configured (`appwrite.config.json`, `functions/Gamer Scout/`).

**CI Pipeline:**
- Not detected (`.github/workflows/` absent).

## Environment Configuration

**Required env vars:**
- Core app: `NODE_ENV`, `PORT`, `FRONTEND_APP_URL`, `APP_URL`, `SYSTEM_API_KEY`.
- Appwrite: `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT`, `APPWRITE_API_KEY`, `APPWRITE_WEBHOOK_SIGNATURE`.
- AI: `OPENAI_KEY`, `GOOGLE_GENAI_KEY`.
- External APIs: `GOOGLE_API_KEY`, `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET`, `IGDB_WEBHOOK_SECRET`, `UNSPLASH_ACCESS_KEY`.
- Notifications/Webhooks: `EVOLUTION_ENDPOINT`, `EVOLUTION_INSTANCE_TOKEN`, `FRONTEND_REVALIDATE_SECRET`.
- Cache tuning: `APP_CACHE_TTL`, `APP_CACHE_MAX`.

**Secrets location:**
- Environment variables at runtime; `.env.example` exists as template marker (empty in repository).

## Webhooks & Callbacks

**Incoming:**
- `POST /webhook/entry-sync` guarded by Appwrite webhook HMAC signature (`src/modules/webhook/webhook.controller.ts`, `src/common/guards/webhook.guard.ts`).
- `POST /webhook/igdb/games/upsert`, `POST /webhook/igdb/genres/upsert`, `POST /webhook/igdb/genres/delete` guarded by IGDB secret header (`src/modules/webhook/webhook.controller.ts`, `src/common/guards/igdb.guard.ts`).

**Outgoing:**
- API revalidation callback: `https://ga.zetho.app/api/revalidate` (`src/common/ai/agents/editor/editor.service.ts`).
- IGDB/Twitch outbound requests from `src/modules/igdb/igdb.service.ts`.
- Evolution API outbound messaging from `src/modules/notifications/evolution.service.ts`.
- Appwrite scheduled function calls API endpoint `${API_ENDPOINT}/igdb/games/popular-sync` (`functions/Gamer Scout/src/main.js`).

---

*Integration audit: 2026-05-29*
