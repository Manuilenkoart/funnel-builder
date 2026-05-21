# User Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track every funnel page view (per screen and paywall) against a persistent user ID stored in a cookie, writing events to Supabase Postgres.

**Architecture:** Next.js edge middleware stamps a `userId` UUID cookie on first visit. Server components on each funnel route call `recordPageView()` directly (no API hop). A server action `saveEmail()` updates the user row when the email form submits.

**Tech Stack:** Next.js 16, `@supabase/supabase-js`, Vitest, Supabase Postgres (project `sdirppjfplgfaoxnadtg`)

---

## File Map

| Status | Path | Responsibility |
|---|---|---|
| Create | `middleware.ts` | Set `userId` cookie on every non-static request |
| Create | `app/lib/supabase/server.ts` | Service-role Supabase client factory |
| Create | `app/lib/tracking.ts` | `recordPageView` + `updateUserEmail` (server-only) |
| Create | `app/actions/tracking.ts` | `saveEmail` server action (callable from client) |
| Create | `__tests__/tracking.test.ts` | Unit tests for tracking module |
| Create | `vitest.config.ts` | Vitest configuration |
| Create | `.env.local.example` | Env var template |
| Modify | `package.json` | Add `@supabase/supabase-js`, `vitest` |
| Modify | `app/(public)/[funnelId]/[screenIndex]/page.tsx` | Call `recordPageView` |
| Modify | `app/(public)/[funnelId]/paywall/page.tsx` | Convert to server component + call `recordPageView` |
| Modify | `app/(public)/[funnelId]/QuestionType/EmailForm.tsx` | Call `saveEmail` on submit |

---

### Task 1: Create Supabase tables

**Files:**
- Uses Supabase MCP tool `apply_migration` on project `sdirppjfplgfaoxnadtg`

- [ ] **Step 1: Apply migration via Supabase MCP**

Call `mcp__plugin_supabase_supabase__apply_migration` with:
- `project_id`: `sdirppjfplgfaoxnadtg`
- `name`: `create_users_and_events`
- `query`:
```sql
create table users (
  id         uuid primary key default gen_random_uuid(),
  email      text unique,
  created_at timestamptz default now()
);

create table events (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  funnel_id   text not null,
  question_id text not null,
  user_id     uuid not null references users(id),
  created_at  timestamptz default now()
);

create index events_user_id_idx on events(user_id);
create index events_funnel_id_idx on events(funnel_id);
```

- [ ] **Step 2: Verify tables exist**

Call `mcp__plugin_supabase_supabase__list_tables` with `project_id: sdirppjfplgfaoxnadtg`, `schemas: ["public"]`, `verbose: true`. Confirm `users` and `events` appear with the correct columns.

---

### Task 2: Install dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime and dev packages**

```bash
npm install @supabase/supabase-js
npm install --save-dev vitest @vitest/coverage-v8
```

- [ ] **Step 2: Verify install**

```bash
node -e "require('@supabase/supabase-js'); console.log('ok')"
```
Expected output: `ok`

---

### Task 3: Create env var template and local env

**Files:**
- Create: `.env.local.example`

- [ ] **Step 1: Write `.env.local.example`**

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

- [ ] **Step 2: Get values from Supabase MCP and populate `.env.local`**

Call `mcp__plugin_supabase_supabase__get_project_url` with `project_id: sdirppjfplgfaoxnadtg` to get the URL.

The service role key must be retrieved from the Supabase dashboard (Project Settings → API → `service_role` key) — the MCP does not expose it. Ask the user to paste it if needed.

Create `.env.local` (never commit this file):
```
NEXT_PUBLIC_SUPABASE_URL=https://sdirppjfplgfaoxnadtg.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<paste-from-dashboard>
```

---

### Task 4: Create Supabase server client helper

**Files:**
- Create: `app/lib/supabase/server.ts`

- [ ] **Step 1: Write client factory**

```ts
import { createClient } from '@supabase/supabase-js';

export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
```

---

### Task 5: Set up Vitest

**Files:**
- Create: `vitest.config.ts`

- [ ] **Step 1: Write Vitest config**

```ts
import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
```

- [ ] **Step 2: Add test script to `package.json`**

In the `"scripts"` section add:
```json
"test": "vitest run"
```

- [ ] **Step 3: Verify Vitest runs (no tests yet)**

```bash
npm test
```
Expected: `No test files found` or exit 0 with 0 tests.

---

### Task 6: Write failing tests for the tracking module

**Files:**
- Create: `__tests__/tracking.test.ts`

- [ ] **Step 1: Write the tests**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockEq, mockInsert, mockUpsert, mockUpdate, mockFrom } = vi.hoisted(() => {
  const mockEq = vi.fn().mockResolvedValue({ error: null });
  const mockInsert = vi.fn().mockResolvedValue({ error: null });
  const mockUpsert = vi.fn().mockResolvedValue({ error: null });
  const mockUpdate = vi.fn(() => ({ eq: mockEq }));
  const mockFrom = vi.fn(() => ({
    upsert: mockUpsert,
    insert: mockInsert,
    update: mockUpdate,
  }));
  return { mockEq, mockInsert, mockUpsert, mockUpdate, mockFrom };
});

vi.mock('@/app/lib/supabase/server', () => ({
  createServerClient: () => ({ from: mockFrom }),
}));

import { recordPageView, updateUserEmail } from '@/app/lib/tracking';

describe('recordPageView', () => {
  beforeEach(() => vi.clearAllMocks());

  it('upserts the user row', async () => {
    await recordPageView('user-abc', 'quiz-1', '0');
    expect(mockFrom).toHaveBeenCalledWith('users');
    expect(mockUpsert).toHaveBeenCalledWith(
      { id: 'user-abc' },
      { onConflict: 'id', ignoreDuplicates: true }
    );
  });

  it('inserts a page_view event with correct fields', async () => {
    await recordPageView('user-abc', 'quiz-1', '0');
    expect(mockFrom).toHaveBeenCalledWith('events');
    expect(mockInsert).toHaveBeenCalledWith({
      name: 'page_view',
      funnel_id: 'quiz-1',
      question_id: '0',
      user_id: 'user-abc',
    });
  });

  it('records paywall as question_id "paywall"', async () => {
    await recordPageView('user-abc', 'quiz-1', 'paywall');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ question_id: 'paywall' })
    );
  });
});

describe('updateUserEmail', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates email on the users table filtered by id', async () => {
    await updateUserEmail('user-abc', 'test@example.com');
    expect(mockFrom).toHaveBeenCalledWith('users');
    expect(mockUpdate).toHaveBeenCalledWith({ email: 'test@example.com' });
    expect(mockEq).toHaveBeenCalledWith('id', 'user-abc');
  });
});
```

- [ ] **Step 2: Run tests — expect them to FAIL**

```bash
npm test
```
Expected: `FAIL __tests__/tracking.test.ts` — module `@/app/lib/tracking` not found.

---

### Task 7: Implement tracking module (make tests pass)

**Files:**
- Create: `app/lib/tracking.ts`

- [ ] **Step 1: Write the module**

```ts
import { createServerClient } from './supabase/server';

export async function recordPageView(
  userId: string,
  funnelId: string,
  questionId: string
): Promise<void> {
  const supabase = createServerClient();
  await supabase
    .from('users')
    .upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true });
  await supabase.from('events').insert({
    name: 'page_view',
    funnel_id: funnelId,
    question_id: questionId,
    user_id: userId,
  });
}

export async function updateUserEmail(
  userId: string,
  email: string
): Promise<void> {
  const supabase = createServerClient();
  await supabase.from('users').update({ email }).eq('id', userId);
}
```

- [ ] **Step 2: Run tests — expect PASS**

```bash
npm test
```
Expected:
```
✓ __tests__/tracking.test.ts (4)
  ✓ recordPageView > upserts the user row
  ✓ recordPageView > inserts a page_view event with correct fields
  ✓ recordPageView > records paywall as question_id "paywall"
  ✓ updateUserEmail > updates email on the users table filtered by id
Test Files  1 passed (1)
```

---

### Task 8: Create saveEmail server action

**Files:**
- Create: `app/actions/tracking.ts`

- [ ] **Step 1: Write the server action**

```ts
'use server';

import { cookies } from 'next/headers';

import { updateUserEmail } from '@/app/lib/tracking';

export async function saveEmail(email: string): Promise<void> {
  const cookieStore = await cookies();
  const userId = cookieStore.get('userId')?.value;
  if (!userId) return;
  await updateUserEmail(userId, email);
}
```

---

### Task 9: Add userId middleware

**Files:**
- Create: `middleware.ts` (at repo root, next to `package.json`)

- [ ] **Step 1: Write middleware**

```ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  if (!request.cookies.get('userId')) {
    response.cookies.set('userId', crypto.randomUUID(), {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
    });
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run lint
```
Expected: no errors on `middleware.ts`.

---

### Task 10: Integrate recordPageView into screen page

**Files:**
- Modify: `app/(public)/[funnelId]/[screenIndex]/page.tsx`

- [ ] **Step 1: Replace the file content**

```tsx
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

import { funnelsConfig } from '@/app/config/funnels';
import { recordPageView } from '@/app/lib/tracking';

import ScreenRenderer from '../QuestionType/ScreenRenderer';

export default async function FunnelScreenPage({
  params,
}: {
  params: Promise<{ funnelId: string; screenIndex: string }>;
}) {
  const { funnelId, screenIndex: screenIndexStr } = await params;
  const config = funnelsConfig[funnelId as keyof typeof funnelsConfig];

  if (!config) notFound();

  const screenIndex = parseInt(screenIndexStr, 10);
  if (isNaN(screenIndex) || screenIndex < 0 || screenIndex >= config.screens.length) {
    notFound();
  }

  const cookieStore = await cookies();
  const userId = cookieStore.get('userId')?.value;
  if (userId) {
    await recordPageView(userId, funnelId, screenIndexStr);
  }

  const screen = config.screens[screenIndex];
  const nextHref =
    screenIndex + 1 < config.screens.length
      ? `/${funnelId}/${screenIndex + 1}`
      : `/${funnelId}/paywall`;
  const prevHref = screenIndex > 0 ? `/${funnelId}/${screenIndex - 1}` : null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white font-sans">
      <div className="w-full max-w-md p-8 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 shadow-2xl transition-all duration-300 hover:shadow-indigo-500/10">
        <ScreenRenderer screen={screen} nextHref={nextHref} prevHref={prevHref} />
      </div>
    </main>
  );
}
```

---

### Task 11: Convert paywall to server component + add recordPageView

**Files:**
- Modify: `app/(public)/[funnelId]/paywall/page.tsx`

- [ ] **Step 1: Replace the file content**

Remove `'use client'` and `use()` hook; await params directly. Add `recordPageView` call.

```tsx
import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { funnelsConfig } from '@/app/config/funnels';
import { recordPageView } from '@/app/lib/tracking';

export default async function FunnelPaywallPage({
  params,
}: {
  params: Promise<{ funnelId: string }>;
}) {
  const { funnelId } = await params;
  const config = funnelsConfig[funnelId as keyof typeof funnelsConfig];

  if (!config) notFound();

  const cookieStore = await cookies();
  const userId = cookieStore.get('userId')?.value;
  if (userId) {
    await recordPageView(userId, funnelId, 'paywall');
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white font-sans">
      <div className="w-full max-w-lg p-8 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 shadow-2xl transition-all duration-300">
        <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
          Final Step: Unlock Access
        </span>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight">
          Choose Your Plan
        </h1>
        <p className="mt-2 text-sm text-slate-300">
          Get lifetime access to the private dashboard and all custom premium tools.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="relative p-6 rounded-xl bg-white/5 border border-white/10 hover:border-indigo-400/50 hover:bg-white/10 transition-all duration-200 flex flex-col justify-between">
            <div>
              <h3 className="text-lg font-bold">Standard Plan</h3>
              <p className="mt-1 text-xs text-slate-400">Basic features &amp; setup</p>
              <div className="mt-4 flex items-baseline">
                <span className="text-3xl font-extrabold">$19</span>
                <span className="ml-1 text-sm text-slate-400">/one-time</span>
              </div>
            </div>
            <Link
              href="/dashboard"
              className="mt-6 block w-full py-2.5 text-center rounded-lg bg-white/10 hover:bg-white/20 text-sm font-semibold transition-all duration-200"
            >
              Get Started
            </Link>
          </div>

          <div className="relative p-6 rounded-xl bg-indigo-600/20 border-2 border-indigo-500 hover:bg-indigo-600/30 transition-all duration-200 flex flex-col justify-between shadow-lg shadow-indigo-500/10">
            <span className="absolute -top-3 right-4 px-2 py-0.5 rounded-full bg-indigo-500 text-[10px] font-bold uppercase tracking-wider">
              Popular
            </span>
            <div>
              <h3 className="text-lg font-bold">Premium Plan</h3>
              <p className="mt-1 text-xs text-indigo-200">Full access &amp; updates</p>
              <div className="mt-4 flex items-baseline">
                <span className="text-3xl font-extrabold">$49</span>
                <span className="ml-1 text-sm text-indigo-200">/one-time</span>
              </div>
            </div>
            <Link
              href="/dashboard"
              className="mt-6 block w-full py-2.5 text-center rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold transition-all duration-200 shadow-md"
            >
              Get Premium
            </Link>
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-xs text-slate-400">
            30-day money back guarantee. Safe &amp; secure payment.
          </p>
        </div>
      </div>
    </main>
  );
}
```

---

### Task 12: Integrate saveEmail into EmailForm

**Files:**
- Modify: `app/(public)/[funnelId]/QuestionType/EmailForm.tsx`

- [ ] **Step 1: Replace the file content**

Add import for `saveEmail`, make `handleSubmit` async, call `saveEmail(email)` before navigating.

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { saveEmail } from '@/app/actions/tracking';
import { EmailQuestionConfig } from '@/app/types/funnel';

interface EmailFormProps {
  screen: EmailQuestionConfig;
  nextHref: string;
}

export default function EmailForm({ screen, nextHref }: EmailFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  const subtitle = screen.componentProps?.subtitle ?? '';
  const placeholder = screen.componentProps?.placeholder ?? 'name@example.com';
  const buttonText = screen.componentProps?.buttonText ?? 'Continue';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Email is required');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address');
      return;
    }
    await saveEmail(email);
    router.push(nextHref);
  };

  return (
    <>
      {subtitle && <p className="mt-2 text-sm text-slate-300">{subtitle}</p>}
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="sr-only">
            Email Address
          </label>
          <input
            type="email"
            id="email"
            placeholder={placeholder}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError('');
            }}
            className="w-full px-5 py-4 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 focus:border-indigo-400 focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all duration-200 text-base font-medium placeholder-slate-400"
          />
          {error && (
            <p className="mt-2 text-sm text-rose-400 font-medium">{error}</p>
          )}
        </div>
        <button
          type="submit"
          className="w-full py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-base font-semibold tracking-wide transition-all duration-200 cursor-pointer shadow-lg hover:shadow-indigo-500/20 active:translate-y-0.5"
        >
          {buttonText}
        </button>
      </form>
    </>
  );
}
```

- [ ] **Step 2: Run lint and type-check**

```bash
npm run lint
```
Expected: no errors.

---

## Self-Review Checklist

- [x] **Spec coverage:** Tables ✓ | userId cookie ✓ | `recordPageView` on all screens ✓ | `recordPageView` on paywall ✓ | `setUserEmail` on email submit ✓ | Supabase client with service-role key ✓
- [x] **Placeholder scan:** No TBDs. All code blocks are complete.
- [x] **Type consistency:** `recordPageView(userId, funnelId, questionId)` signature matches across Task 7, 10, 11. `updateUserEmail(userId, email)` matches Tasks 7 and 8. `saveEmail(email)` in Task 8 matches import in Task 12.
