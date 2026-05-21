# Screen-per-route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the all-screens loop with `/{funnelId}/[screenIndex]` routing so each screen in `config.screens` is a distinct URL, with forward and backward navigation wired up.

**Architecture:** A new `[screenIndex]/page.tsx` server component reads the index from params, validates it, computes `nextHref`/`prevHref`, and passes them to `ScreenRenderer`. `RowList` and a new `EmailForm` component receive `nextHref` as a prop. The existing `/email` dedicated route is deleted.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Tailwind CSS 4.

---

### Task 1: Create EmailForm component

**Files:**
- Create: `app/(public)/[funnelId]/QuestionType/EmailForm.tsx`

- [ ] **Step 1: Create EmailForm.tsx**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { EmailQuestionConfig } from "@/app/types/funnel";

interface EmailFormProps {
  screen: EmailQuestionConfig;
  nextHref: string;
}

export default function EmailForm({ screen, nextHref }: EmailFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  const subtitle = screen.componentProps?.subtitle ?? "";
  const placeholder = screen.componentProps?.placeholder ?? "name@example.com";
  const buttonText = screen.componentProps?.buttonText ?? "Continue";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError("Email is required");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address");
      return;
    }
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
              setError("");
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

- [ ] **Step 2: Lint**

```bash
npm run lint
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/\(public\)/\[funnelId\]/QuestionType/EmailForm.tsx
git commit -m "feat: add EmailForm component"
```

---

### Task 2: Update [funnelId]/page.tsx to redirect to /0

**Files:**
- Modify: `app/(public)/[funnelId]/page.tsx`

- [ ] **Step 1: Replace file contents**

```tsx
import { redirect } from "next/navigation";

export default async function FunnelLandingPage({
  params,
}: {
  params: Promise<{ funnelId: string }>;
}) {
  const { funnelId } = await params;
  redirect(`/${funnelId}/0`);
}
```

- [ ] **Step 2: Lint**

```bash
npm run lint
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/\(public\)/\[funnelId\]/page.tsx
git commit -m "feat: redirect /{funnelId} to /{funnelId}/0"
```

---

### Task 3: Update RowList to accept nextHref prop

**Files:**
- Modify: `app/(public)/[funnelId]/QuestionType/RowList.tsx`

- [ ] **Step 1: Replace file contents**

```tsx
import Link from "next/link";

import { RowListQuestionConfig } from "@/app/types/funnel";

interface RowListProps {
  screen: RowListQuestionConfig;
  nextHref: string;
}

export default function RowList({ screen, nextHref }: RowListProps) {
  return (
    <div className="mt-8 space-y-3">
      {screen.componentProps?.list?.map((option) => (
        <Link
          key={option.id}
          href={nextHref}
          className="block w-full px-5 py-4 text-left rounded-xl bg-white/5 border border-white/10 hover:border-indigo-400 hover:bg-white/10 transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 text-base font-medium shadow-sm hover:shadow-md hover:-translate-y-0.5"
        >
          {option.text}
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Lint**

```bash
npm run lint
```
Expected: ScreenRenderer still passes `funnelId` to RowList — TypeScript will flag this. That error is resolved in Task 4. Lint (ESLint) should pass; TypeScript errors from ScreenRenderer are expected at this stage.

- [ ] **Step 3: Commit**

```bash
git add app/\(public\)/\[funnelId\]/QuestionType/RowList.tsx
git commit -m "feat: update RowList to use nextHref prop"
```

---

### Task 4: Update ScreenRenderer with email branch and navigation props

**Files:**
- Modify: `app/(public)/[funnelId]/QuestionType/ScreenRenderer.tsx`

- [ ] **Step 1: Replace file contents**

```tsx
import { QuestionConfig, QuestionType } from "@/app/types/funnel";

import EmailForm from "./EmailForm";
import RowList from "./RowList";

interface ScreenRendererProps {
  screen: QuestionConfig;
  nextHref: string;
  prevHref: string | null;
}

export default function ScreenRenderer({
  screen,
  nextHref,
  prevHref: _prevHref,
}: ScreenRendererProps) {
  return (
    <div className="mt-4">
      <h1
        className={`font-extrabold tracking-tight ${screen.title.tailwindcss || ""}`}
      >
        {screen.title.text}
      </h1>

      {screen.type === QuestionType.rowList && (
        <RowList screen={screen} nextHref={nextHref} />
      )}
      {screen.type === QuestionType.email && (
        <EmailForm screen={screen} nextHref={nextHref} />
      )}
    </div>
  );
}
```

> Note: `prevHref` is aliased to `_prevHref` to satisfy the linter while the nav bar is not yet built. Remove the alias when the nav bar is implemented.

- [ ] **Step 2: Lint**

```bash
npm run lint
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/\(public\)/\[funnelId\]/QuestionType/ScreenRenderer.tsx
git commit -m "feat: update ScreenRenderer with email branch and nextHref/prevHref props"
```

---

### Task 5: Create [screenIndex]/page.tsx

**Files:**
- Create: `app/(public)/[funnelId]/[screenIndex]/page.tsx`

- [ ] **Step 1: Create the directory and file**

```tsx
import { notFound } from "next/navigation";

import { funnelsConfig } from "@/app/config/funnels";

import ScreenRenderer from "../QuestionType/ScreenRenderer";

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

- [ ] **Step 2: Lint**

```bash
npm run lint
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(public)/[funnelId]/[screenIndex]/page.tsx"
git commit -m "feat: add [screenIndex]/page.tsx server component"
```

---

### Task 6: Delete email/page.tsx and final verification

**Files:**
- Delete: `app/(public)/[funnelId]/email/page.tsx`

- [ ] **Step 1: Delete the file**

```bash
rm "app/(public)/[funnelId]/email/page.tsx"
rmdir "app/(public)/[funnelId]/email"
```

- [ ] **Step 2: Production build (full TypeScript + lint verification)**

```bash
npm run build
```
Expected: build completes with no errors or type failures.

- [ ] **Step 3: Manual smoke test**

Start the dev server (`npm run dev`) and verify:
- `http://localhost:3000/quiz-1` → redirects to `/quiz-1/0`
- `/quiz-1/0` → shows "What is your age?" row list; clicking any option navigates to `/quiz-1/1`
- `/quiz-1/1` → shows email form; submitting a valid email navigates to `/quiz-1/paywall`
- `/quiz-1/paywall` → paywall page unchanged
- `/quiz-1/99` → 404
- `/quiz-2/0` → shows "What is your primary goal?" row list

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "feat: delete /email route, complete screen-per-route migration"
```
