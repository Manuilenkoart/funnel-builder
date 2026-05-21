# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # Dev server (Next.js 16)
npm run build    # Production build
npm run start    # Serve production build
npm run lint     # ESLint
```

## Stack

Next.js 16.2.6, React 19.2.4, TypeScript 5, Tailwind CSS 4 (PostCSS plugin).

## Architecture

**Route groups:**
- `(public)/` — unauthenticated funnel pages
- `(private)/` — authenticated dashboard (placeholder)

**Funnel flow** (all under `[funnelId]/`):
```
/{funnelId}          → landing/question screens
/{funnelId}/email    → email capture screen
/{funnelId}/paywall  → pricing/paywall screen
/dashboard           → post-purchase destination
```

**Data layer** — `app/config/funnels.ts` is the single source of truth. It exports `funnelsConfig: Record<QuizId, FunnelConfig>`. To add a new funnel, add a key here; no routing changes needed.

**Type system** — `app/types/funnel.ts` defines a discriminated union: `QuestionConfig = RowListQuestionConfig | EmailQuestionConfig`. Each variant carries its own `componentProps` shape. Add new question types by extending the union and the `QuestionType` enum.

**Screen dispatch** — `QuestionType/ScreenRenderer.tsx` is the type-switch dispatcher. `page.tsx` handles data-fetching/layout; `ScreenRenderer` maps `QuestionConfig.type` → the right component. New question types get a component in `QuestionType/` and a branch in `ScreenRenderer`.

**Server vs client boundary:**
- `[funnelId]/page.tsx` — async server component, reads `params` as a Promise
- `email/page.tsx`, `paywall/page.tsx` — `"use client"`, unwrap `params` with `use()`
