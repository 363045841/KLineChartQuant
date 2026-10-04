# Package Boundary Separation

Eliminate TS6059 errors across `packages/vue` and `packages/core`.

## Problem

Vue package's `tsconfig.build.json` (`rootDir: "src"`) imported core source files directly via path aliases:

```json
{
  "paths": {
    "@363045841yyt/klinechart-core": ["../core/src"]
  }
}
```

This dragged `packages/core/src/**` into Vue's TypeScript compilation scope. Since `rootDir: "src"`
limited the compilation to `packages/vue/src/**`, every import of core source triggered:

```
TS6059: File '.../packages/core/src/...' is not under 'rootDir' '.../packages/vue/src'
```

The errors propagated through the import chain — a single import from `vue/src/index.ts` →
`@363045841yyt/klinechart-core` → `core/src/index.ts` → its re-exports → their dependencies →
all the way down, producing ~40 errors per run.

A secondary issue: **MarkerTooltip.vue** imported core types using a raw relative path to
packages/core:

```ts
import type { MarkerEntity, CustomMarkerEntity } from '../../../core/src/engine/marker/registry'
```

This bypasses both the package name and the workspace symlink.

## Solution

### 1. Remove core source path aliases

Both `tsconfig.json` (dev) and `tsconfig.build.json` (build) no longer alias
`@363045841yyt/klinechart-core` to `../core/src`.

TypeScript resolves `@363045841yyt/klinechart-core` through pnpm's workspace symlink:

```
packages/vue/node_modules/@363045841yyt/klinechart-core
  → packages/core (symlink)
  → package.json exports.types → ./dist/index.d.ts
```

The Vue package now sees only core's **built declaration files**, not its raw source.
This eliminates the `rootDir` violation and enforces a clean API boundary.

### 2. Add missing core export

Added `"./engine/marker/registry"` to `packages/core/package.json` exports so the
MarkerTooltip component can import through the package name:

```ts
import type { MarkerEntity, CustomMarkerEntity } from '@363045841yyt/klinechart-core/engine/marker/registry'
```

### 3. Remove duplicate copyFile

Vue's `package.json` had the same `copyFileSync` in both `build` and `postbuild`. Kept
only `postbuild`, which runs automatically after `vite build`.

### 4. Workspace build command

Added `build:packages` to root `package.json`:

```json
"build:packages": "pnpm --filter @363045841yyt/klinechart-core build && pnpm --filter @363045841yyt/klinechart build"
```

Builds core first, then Vue — mirroring the production dependency order.

## Files Changed

| File | Change |
|---|---|
| `packages/vue/tsconfig.json` | Removed 16 core source path aliases |
| `packages/vue/tsconfig.build.json` | Removed 15 core source path aliases |
| `packages/vue/package.json` | Removed duplicate `copyFileSync` from `build` script |
| `packages/vue/src/components/MarkerTooltip.vue` | Relative path → package import |
| `packages/core/package.json` | Added `"./engine/marker/registry"` export |
| `package.json` (root) | Added `build:packages` script |

## Verification

```bash
pnpm --filter @363045841yyt/klinechart-core build           # exit 0
pnpm --filter @363045841yyt/klinechart exec vue-tsc --noEmit  # exit 0
pnpm --filter @363045841yyt/klinechart build                  # exit 0
pnpm run build:packages                                       # exit 0
```

## Future Work

- `react` and `angular` packages can follow the same pattern once they reach build stage
- The root `vite.config.ts` and `tsconfig.app.json` still reference a non-existent `src/`
  directory (legacy scaffold); consider removing or updating when the monorepo transition
  is complete
- Core exports are ESM-only — if CJS support is needed, add a dual-package build
