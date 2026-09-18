# `examples/` — Framework SSR Smoke Tests

These are **not feature demos**. They exist to verify that each adapter
package (`@363045841yyt/klinechart-{react,vue,angular}`) is SSR-safe: the adapter
modules can be imported on a server (Next.js RSC pass, Nuxt server render,
Angular Universal prerender) without crashing, and DOM access is gated to
the client.

## Why a separate directory

Each adapter contract documents an SSR-safety guarantee:

| Adapter | Mount happens in | Server import safe? |
| --- | --- | --- |
| React | `useEffect` | yes — no `window` at module init |
| Vue   | `onMounted` | yes — no `window` at module init |
| Angular | `ngAfterViewInit` gated by `isPlatformBrowser` | yes |

Unit tests cover the API surface and lifecycle in jsdom, but they cannot
verify the **build pipeline** of each framework. These examples plug each
adapter into a real Next.js / Nuxt / Angular SSR build and confirm it does
not regress.

## Workspace isolation

`examples/*` is **deliberately excluded from the root `pnpm-workspace.yaml`**.
Reasons:

1. Each example pulls in a full framework's dev toolchain (Next.js + React
   compiler, Nuxt + Vite, Angular CLI + zone.js). Including them in the root
   workspace would multiply CI install times and lockfile churn.
2. Smoke tests are run on-demand, not as part of every PR.
3. Versions of Next.js / Nuxt / Angular change frequently; pinning them at
   the root workspace level would couple library CI to framework releases.

Each example is run standalone:

```bash
cd examples/next-app && pnpm install && pnpm build
cd examples/nuxt-app && pnpm install && pnpm build
cd examples/angular-universal && pnpm install && pnpm build  # see angular README first
```

## What gets verified

| Example | KEY file | What a regression would look like |
| --- | --- | --- |
| `next-app/` | `app/page.tsx` | `pnpm build` errors with `ReferenceError: window is not defined` in the SSR prerender |
| `nuxt-app/` | `pages/index.vue` `<script setup>` | `nuxt build` crashes in the SSR pass on adapter module evaluation |
| `angular-universal/` | `src/app/app.component.ts` + adapter's `isPlatformBrowser` guard | `ng build` server bundle emits but server execution throws |

## What does NOT get verified

- The chart **engine** itself is not SSR-renderable (canvas / WebGL on the
  server makes no sense). The contract is "import-safe and mount-safe", not
  "renders pixels on the server".
- Visual fidelity, indicator correctness, drawing tools — all covered by
  unit tests and the preview demo at `packages/vue/preview`.

## Adding a new framework

If a fourth framework needs an adapter (Solid, Svelte, Qwik), follow the
same pattern:

1. `examples/<framework>-app/` with the minimal setup that runs the
   framework's SSR pipeline.
2. Import the adapter at module top level somewhere SSR-evaluated.
3. A README documenting the KEY assertion file and the build command.
