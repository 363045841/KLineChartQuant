# Next.js 15 SSR Smoke �?`@363045841yyt/klinechart-react`

Minimal Next.js 15 App Router app that proves `@363045841yyt/klinechart-react` is
**SSR-safe**: importing the adapter on the server must not crash, and the
chart must mount only in the browser via `useEffect`.

## What this proves

| Boundary | File | Contract verified |
| --- | --- | --- |
| Module import on server | `app/page.tsx` | Adapter loads at top of a **server component** without touching `window` / `document` |
| Client mount via `useEffect` | `app/chart.tsx` | `useChart(ref, opts)` only touches DOM after commit |
| Build pipeline | `next build` | No `ReferenceError: window is not defined` in the SSR prerender pass |

The KEY file for the SSR-safety contract is **`app/page.tsx`** �?it imports
`@363045841yyt/klinechart-react` at module top level from a server component. If the
adapter regressed and accessed `window` at module init, this build would
fail.

## Versions targeted

| Tool | Version |
| --- | --- |
| Next.js | 15.x (App Router) |
| React  | 19.x |
| Node   | ^20.19 / >=22.12 (matches repo root) |

## How to run

This example is **not** part of the root pnpm workspace (see top-level
`examples/README.md` for the rationale). Install + build from inside the
example:

```bash
cd examples/next-app
pnpm install
pnpm build
```

A successful `pnpm build` is the verification. You do **not** need to run
`pnpm dev` for the smoke test �?the build pass exercises the SSR pipeline.

If you do run `pnpm dev`, the client-side `useChart` hook will throw
`No ChartControllerFactory registered` until the production factory is
wired (Phase 1 deliverable per the adapter source). That is expected and
**does not invalidate the SSR smoke**.

## Current limitations

- The chart engine itself is not visually rendered �?the smoke proves
  import + SSR build + client commit, not pixels.
- This example is intentionally isolated from `pnpm -r test` so it never
  blocks unrelated CI runs.
- Workspace dependency on `@363045841yyt/klinechart-react` is `workspace:*`; if
  you copy this example outside the monorepo, replace it with a real
  published version.

## Files

```
examples/next-app/
├── app/
�?  ├── chart.tsx         # 'use client' �?useChart with real ref
�?  ├── layout.tsx        # Minimal HTML shell
�?  └── page.tsx          # Server component �?adapter import at module top
├── next.config.mjs       # transpilePackages for workspace symlinks
├── next-env.d.ts
├── package.json          # private, workspace:* dep
├── tsconfig.json
└── README.md
```
