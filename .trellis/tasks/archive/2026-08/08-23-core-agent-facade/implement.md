# Core Agent Facade - Implementation Plan

## 1. Contract Tests First

- [x] Add context-facade tests for serialization, deep immutability, stable
      chart identity, ranges, numeric params, no-data behavior, and revisions.
- [x] Expand indicator-query tests for default/maximum limits, invalid inputs,
      empty ranges, one retry, and continuous revision churn.
- [x] Add controller integration coverage proving `ChartController.agent` uses
      the mounted chart's real state.
- [x] Add package-boundary coverage for root/controllers/`./agent` exports.

## 2. Public Types And Errors

- [x] Define `ChartAgentController`, `ChartAgentContextSnapshot`, bounded range,
      active-indicator, and `IndicatorQueryInput` public types.
- [x] Add the append-only Agent codes to `KLineChartErrorCode` and expose a
      frozen public error-code map.
- [x] Add stable root, controller, feature, and package subpath exports without
      exporting `DataState` or calculator internals.

## 3. Facade Implementation

- [x] Implement detached/frozen context projection from injected Core getters.
- [x] Create one chart ID and chart revision tracker per controller instance.
- [x] Wire the facade into `createChartController` and dispose all revision
      subscriptions/effects with the controller.
- [x] Keep the existing query service as the sole calculation/formatting path.

## 4. Query Hardening

- [x] Normalize inputs and map every required failure to its public stable code.
- [x] Reject a valid requested range with no matching active bar.
- [x] Preserve full-lookback calculation, compact output, default 20, maximum
      2000, and exactly one retry after a data revision change.

## 5. Verification

- [x] Run targeted Agent/controller tests:
      `pnpm --filter @363045841yyt/klinechart-core test -- src/features/agent src/controllers`.
- [x] Run the full Core test suite:
      `pnpm --filter @363045841yyt/klinechart-core test`.
- [x] Run Core build and package checks:
      `pnpm --filter @363045841yyt/klinechart-core build`,
      `pnpm --filter @363045841yyt/klinechart-core lint:publish`, and
      `pnpm --filter @363045841yyt/klinechart-core lint:types` where supported.
- [x] Run the repository typecheck/lint gates relevant to changed files.
- [x] Run `trellis-check`, update executable specs, inspect the final diff, and
      confirm no secret or unrelated untracked file is staged.

## 6. Delivery

- [ ] Commit the scoped Core change and task records.
- [ ] Archive the child task so the parent records 2/7 complete.
- [ ] Push `feat/core-agent-facade` and open a PR against upstream `main` with
      requirement and test evidence.

## Verification Notes

- Core tests, Core build, strict publint, Angular adapter tests, targeted Vue
  adapter tests, Electron TypeScript, Node ESM `./agent` import, and formatting
  pass.
- `attw` still fails on the package's existing CJS/no-extension subpaths. The
  new `./agent` subpath is green for Node16 ESM and bundler resolution; it only
  inherits the package-wide absence of a CommonJS `require` condition.
- Root `vue-tsc --build` still reports pre-existing Vue `defaultConfig`, Core
  test strictness, and React declaration diagnostics. The two new missing-agent
  mock diagnostics were fixed in Angular and Vue.
- The full Vue suite still has seven existing Node localStorage-environment
  failures; the two affected adapter contract files pass 20/20.

## Rollback Points

- After contract/type exports, revert before controller wiring if the public
  boundary cannot remain additive.
- After targeted tests, revert the revision tracker independently if it causes
  unrelated controller notifications; the facade must never mutate chart state.
- Do not continue to runtime/registry work until Core build and package export
  checks pass.
