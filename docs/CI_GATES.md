# CI Gates

This file documents the quality gates wired into `.github/workflows/library-ci.yml`
and their current enforcement state. **Updating this file is part of changing a
gate's enforcement level** — if you flip a step from `continue-on-error: true` to
required, update the table here in the same PR.

## Gate matrix

| Gate                          | Tool                          | Scope             | State    | Promotion blocker                                                                |
|-------------------------------|-------------------------------|-------------------|----------|----------------------------------------------------------------------------------|
| Package unit tests            | `pnpm -r test` (vitest)       | All workspaces    | REQUIRED | —                                                                                |
| Legacy root vitest suite      | `./node_modules/.bin/vitest`  | Root `src/`       | NOT WIRED| Root `src/` was removed when the code moved into `packages/`, so the root run finds no tests and no workflow invokes it. |
| Bundle size budgets           | `size-limit`                  | core/react/vue/ng | WARN     | Budgets are still pre-build measurements off `src/index.ts`; core currently reports ~242 kB against a 30 kB limit. |
| Publish hygiene (exports/types/main) | `publint --strict`     | core/react/vue/ng | WARN     | publint needs `dist/` to verify file existence under `pkg.exports`.              |
| Type-resolution (ESM)         | `@arethetypeswrong/cli` (attw)| core/agent-runtime/vue/react/ng | REQUIRED | —                                                        |
| Per-package build             | `pnpm -r build` (tsc)         | All workspaces    | WARN     | The recursive run also targets `packages/desktop-electron` (`electron-builder`) and `examples/angular-universal` (`ng build`, fails outside its own workspace), so it is not a library gate. The publishable packages are built by the test job instead. |
| Coverage threshold            | `@vitest/coverage-v8`         | Root              | NOT WIRED| Intentionally deferred until Round 1E lands real engine code worth covering.     |

### attw profile

`pnpm lint:types` runs `scripts/lint-types.mjs`, which pins one profile for
every publishable package:

- `--profile esm-only` — each publishable package ships ESM only, and Node 22+
  supports `require()` of ESM, so the legacy Node CJS resolution rules only
  produce false alarms here.
- `--exclude-entrypoints style.css` for the Vue package — a CSS entry is not
  JavaScript and can never resolve as a type.

The package list and the per-package exclusions live in that script, so the
profile has a single definition. Gate the new package by adding it there.

## Per-package bundle budgets

These are pre-build, source-based measurements (`size-limit` reads from
`packages/<x>/src/index.ts`). They will be re-measured against `dist/index.js`
once the build pipeline lands.

| Package | Limit (gzip) | Today's measurement | Rationale                                                                 |
|---------|--------------|---------------------|---------------------------------------------------------------------------|
| core    | 30 KB        | ~1.6 KB             | Headroom for signals + controller scaffolding + a minimal indicator set.  |
| react   | 8 KB         | ~0.8 KB             | Thin wrapper around core (`use*` hooks); peers excluded from the budget.  |
| vue     | 8 KB         | ~1.1 KB             | Thin composable layer; `vue` excluded from the budget.                    |
| angular | 10 KB       | ~1.2 KB             | Angular decorator runtime traditionally adds 1–2 KB; extra slack on top.  |

If a limit trips, **do not raise it reflexively** — first check whether a tree
shake or peer-dep externalization is the right move.

## Publishing readiness (Round 1E target)

When Round 1E lands and we are ready to publish:

1. `library-ci.yml` already builds every package under the type-resolution gate
   before running it; `lint:publish` and `size:packages` reuse those builds.
2. Flip the remaining warn-only gates to required (remove
   `continue-on-error: true`) once their blockers in the matrix are resolved.
3. Re-baseline the size budgets against the real `dist/index.js`.
4. Verify `publishConfig.provenance: true` is honored by the publish workflow
   (it requires `id-token: write` permission and OIDC-enabled runners — already
   the default on `ubuntu-latest`).

## Promotion order for the remaining warn-only gates

`lint:types` (attw) is required as of #189. The two gates still warn-only:

1. **`publint --strict`** — cheapest to fix, catches broken `exports`/`main`/
   `types` paths before a user ever installs the package. Failure here means
   the package is literally unimportable. It passes today; promote it once the
   `exports` shape of every publishable package is settled.
2. **`size-limit`** — still measured pre-build off `src/index.ts`, so the
   budgets must be re-baselined against the real `dist/` output before the
   gate can be trusted.

Promoting `attw` first was deliberate: unlike the other two, it was the only
gate that could see the type/runtime mismatch shipped in #189 (extensionless
relative imports, `.vue` declaration specifiers, a leaked workspace path), so
it had to go live before the packages could be called correct.

## Local commands

```bash
pnpm test:packages     # workspace tests
pnpm size:packages     # bundle budgets
pnpm lint:publish      # publint --strict, every publishable package
pnpm lint:types        # attw (esm-only profile), every publishable package
```
