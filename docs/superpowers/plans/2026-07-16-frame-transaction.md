# Frame Transaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or executing-plans. Steps use checkbox syntax.

**Goal:** Add a single-generation frame transaction primitive, then migrate chart high-frequency state onto it without dual latest/published views.

**Architecture:** Private pending input + capture/derive/seal/render/publish phases; one immutable snapshot signal; re-entrant writes go to next generation.

**Tech Stack:** TypeScript, vitest, existing `createSignal` / `batch` in `packages/core/src/foundation/reactivity`.

---

### Task 1: FrameTransaction primitive

**Files:**
- Create: `packages/core/src/foundation/reactivity/frameTransaction.ts`
- Create: `packages/core/src/foundation/reactivity/__tests__/frameTransaction.test.ts`
- Modify: `packages/core/src/foundation/reactivity/index.ts`

- [ ] Failing tests for coalesce, generation, re-entry isolation, fail-no-publish, selector equality
- [ ] Implement `createFrameTransaction`
- [ ] Export from reactivity index
- [ ] `vitest run` on the new test file

### Task 2: Renderer single snapshot

**Files:**
- Modify: `packages/core/src/engine/render/chartRenderer.ts`
- Tests around prepareFrameData / draw paths

- [ ] Build immutable frame snapshot in prepare
- [ ] Pass snapshot into draw path; no reverse write of positions into interaction during paint
- [ ] Keep visual parity for existing chart.dpr / render tests

### Task 3: Interaction writeInput

**Files:**
- Modify: `packages/core/src/engine/controller/interaction.ts`
- Modify: `packages/core/src/engine/state/interactionState.ts`

- [ ] pointermove writes pending frame input only
- [ ] flush derives crosshair/hover/tooltip once per frame
- [ ] keep isDragging / dragMode as committed signals

### Task 4: Scroll + selectors

**Files:**
- Modify: viewport scroll path
- Modify: Vue interaction bridge

- [ ] scroll writes frame input or commits with published frame field
- [ ] Vue uses equality selectors off published frame

### Task 5: Delete legacy high-frequency signals

- [ ] remove kLinePositions/crosshair high-freq dual paths
- [ ] full core tests + tsc

---

## Verification commands

```bash
pnpm --filter @363045841yyt/klinechart-core exec vitest run src/foundation/reactivity/__tests__/frameTransaction.test.ts
pnpm --filter @363045841yyt/klinechart-core exec tsc -p tsconfig.build.json --noEmit
```
