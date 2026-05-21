# User Tracking Design

**Date:** 2026-05-21  
**Status:** Approved

## Goal

Track funnel progression per user:
- How many users entered the funnel
- How many advanced through each screen
- How many reached the paywall

## Data Model

Two tables in Supabase Postgres:

```sql
users (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text UNIQUE,
  created_at timestamptz DEFAULT now()
)

events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,           
  funnel_id   text NOT NULL,
  question_id text NOT NULL,           -- screenIndex as string ("0", "1", …) or "paywall"
  user_id     uuid NOT NULL REFERENCES users(id),
  created_at  timestamptz DEFAULT now()
)
```

## Event Structure

Every page view records one event:

```json
{
  "event": { "id": "<uuid>", "name": "page_view" },
  "funnelId": "quiz-1",
  "questionId": "0",
  "userId": "<uuid>"
}
```

`questionId` values by route:
- `/{funnelId}/0` → `"0"`
- `/{funnelId}/1` → `"1"`
- `/{funnelId}/paywall` → `"paywall"`

## User Identity

- On first request to any funnel route, Next.js middleware checks for a `userId` cookie.
- If absent: generates `crypto.randomUUID()`, sets cookie (`httpOnly`, `SameSite=Lax`, 1-year expiry).
- The `User` row is created lazily on first `recordPageView` call using upsert (no-op if the id already exists).
- Email is `null` until the user submits the email form; at that point `setUserEmail` updates the row.

## Architecture

### Middleware (`middleware.ts`)

- Matches `/[funnelId]/*` public routes via `matcher` config.
- Sole responsibility: ensure `userId` cookie exists on every request.
- No database calls — pure cookie lifecycle.

### Tracking module (`app/lib/tracking.ts`)

Server-only module (never imported by client components). Uses the Supabase service-role client.

```ts
recordPageView(userId: string, funnelId: string, questionId: string): Promise<void>
setUserEmail(userId: string, email: string): Promise<void>
```

`recordPageView` steps:
1. Upsert `users` row with `id = userId` (inserts on first visit, no-op on repeat).
2. Insert into `events`: `name = "page_view"`, `funnel_id`, `question_id`, `user_id`.

### Page integration

| Route | Component type | Tracking call |
|---|---|---|
| `/{funnelId}/[screenIndex]` | Server component | `recordPageView(userId, funnelId, screenIndex)` |
| `/{funnelId}/paywall` | Server component | `recordPageView(userId, funnelId, "paywall")` |
| Email form submit | Server action | `setUserEmail(userId, email)` |

All pages read `userId` from `cookies()` (Next.js `next/headers`). The `setUserEmail` server action also reads `userId` from `cookies()` server-side — it does not accept userId as a client-supplied parameter (prevents spoofing).

### Supabase client

- A single `app/lib/supabase/server.ts` helper creates the service-role client using `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` env vars.
- These vars are server-only (no `NEXT_PUBLIC_` prefix).

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=       # also used client-side if needed later
SUPABASE_SERVICE_ROLE_KEY=      # server-only, never exposed to browser
```

## Out of Scope

- Dashboard UI to view tracking data (separate feature)
- Deduplication of repeat page views (same user refreshing)
- Session concept beyond the cookie lifetime
