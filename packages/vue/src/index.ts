/**
 * @363045841yyt/klinechart — public API surface.
 *
 * Vue 3 bindings for @363045841yyt/klinechart-core. Bridges core signals to Vue's
 * reactivity via `shallowRef` + `effect` so each adapter owns its own
 * reactivity boundary — no proxy wrapping of immutable signal values.
 *
 * Backward-compatibility contract: `KMapPlugin.install(app)` MUST exist
 * because legacy users of `@363045841yyt/klinechart` consume it.
 */

import type {
  ChartController,
  ChartControllerFactory,
  ChartMountOptions,
  ChartViewport,
  IndicatorDefinition,
  IndicatorInstance,
  InteractionSnapshot,
  KLineData,
} from '@363045841yyt/klinechart-core'
import { createIndicatorSelectorController } from '@363045841yyt/klinechart-core'
import type { Signal } from '@363045841yyt/klinechart-core/reactivity'
import { onBeforeUnmount, onScopeDispose, shallowRef, watch, type App, type Ref } from 'vue'

import { KlineChart } from './components/index'
import './styles/scrollbar.css'

export type {
  ChartController,
  ChartMountOptions,
  ChartViewport,
  CustomDataSource,
  KLineData,
} from '@363045841yyt/klinechart-core'

// ---------------------------------------------------------------------------
// SFC components (for consumers using Vite / SFC compiler)
// ---------------------------------------------------------------------------

export {
  DrawingStyleToolbar,
  IndicatorParams,
  IndicatorSelector,
  KlineChart,
  KLineTooltip,
  LeftToolbar,
  MarkerTooltip,
} from './components/index'

export type {
  KlineTooltipSlotProps,
  MarkerTooltipSlotProps,
  LegendSlotProps,
} from './components/index'
export type {
  LegendTemplateContext,
  LegendRenderMode,
  LegendLayout,
  LegendCurrentBar,
  LegendTimeshareRow,
  LegendIndicatorRow,
  LegendComparisonRow,
} from '@363045841yyt/klinechart-core/controllers'

// ---------------------------------------------------------------------------
// Shared Agent workbench (browser and Electron Renderer)
// ---------------------------------------------------------------------------

export { default as AgentWorkbenchShell } from './features/agent/AgentWorkbenchShell.vue'
export { default as AgentWorkspace } from './features/agent/components/AgentWorkspace.vue'
export * from './features/agent/agent-contracts'
export {
  createInitialAgentState,
  reduceAgentUiEvent,
  type AgentWorkspaceState,
} from './features/agent/agent-reducer'
export { useAgentWorkspace } from './features/agent/use-agent-workspace'
export type { AgentPanelWidthStorage } from './features/agent/workbench-shell'

// ---------------------------------------------------------------------------
// Controller factory injection
//
// The concrete `createChartController` from packages/core/src/controllers/
// (Phase 1A deliverable) is not yet wired. Adapters and tests inject a
// factory via `__setControllerFactory` so the public API surface stays stable.
// ---------------------------------------------------------------------------

let controllerFactory: ChartControllerFactory | null = null

/**
 * Inject the ChartController factory. Called by:
 *   - the core package's bootstrap once `createChartController` is implemented
 *   - tests that need a mock controller
 */
export function __setControllerFactory(factory: ChartControllerFactory | null): void {
  controllerFactory = factory
}

// ---------------------------------------------------------------------------
// createChart �?imperative mount
// ---------------------------------------------------------------------------

/**
 * Imperative mount API. Returns a controller; caller is responsible for `dispose`.
 *
 * Throws if container is null/undefined (SSR-safe guard).
 */
export function createChart(opts: ChartMountOptions): ChartController | Promise<ChartController> {
  if (opts.container == null) {
    throw new Error(
      '[@363045841yyt/klinechart] createChart: `container` is required and must be a non-null HTMLElement',
    )
  }
  if (controllerFactory === null) {
    throw new Error(
      '[@363045841yyt/klinechart] createChart: no ChartController factory registered. ' +
        'Call __setControllerFactory(...) before mounting (the core package wires this in production).',
    )
  }
  return controllerFactory(opts)
}

import { coreSignalToVueRef } from './utils/signalBridge'
export { coreSignalToVueRef }

// ---------------------------------------------------------------------------
// useChart �?composable
// ---------------------------------------------------------------------------

/**
 * Composable. Pass a template ref to the container element.
 *
 * Watches `containerRef` to populate; once it does, calls `createChart`
 * and exposes the controller via a `shallowRef`. Disposes on scope teardown.
 */
export function useChart(
  containerRef: Ref<HTMLElement | null>,
  opts: Omit<ChartMountOptions, 'container'>,
): { chart: Ref<ChartController | null> } {
  const chart = shallowRef<ChartController | null>(null)
  let disposed = false

  const mountIfReady = (el: HTMLElement | null): void => {
    if (el == null || chart.value != null) return
    const created = createChart({ ...opts, container: el })
    const applyController = (ctrl: ChartController): void => {
      if (disposed) {
        ctrl.dispose()
        return
      }
      chart.value = ctrl
    }

    if (typeof (created as Promise<ChartController>).then === 'function') {
      ;(created as Promise<ChartController>).then(applyController)
    } else {
      applyController(created as ChartController)
    }
  }

  // Mount synchronously if the ref is already populated (e.g. SFC where the
  // template ref is set before this composable's effect runs).
  mountIfReady(containerRef.value)

  // Otherwise watch for the ref to populate.
  const stopWatch = watch(
    containerRef,
    (el) => {
      mountIfReady(el)
    },
    { immediate: true, flush: 'post' },
  )

  const dispose = (): void => {
    disposed = true
    stopWatch()
    const ctrl = chart.value
    if (ctrl != null) {
      ctrl.dispose()
      chart.value = null
    }
  }

  onScopeDispose(dispose)
  // Belt-and-braces: SFC components running outside a manual scope still get
  // unmount cleanup via the component lifecycle hook.
  onBeforeUnmount(dispose)

  return { chart }
}

// ---------------------------------------------------------------------------
// useIndicators �?composable
// ---------------------------------------------------------------------------

/**
 * Bridge the Chart's indicators signal into a Vue shallowRef.
 */
export function useIndicators(controller: ChartController): {
  indicators: Ref<ReadonlyArray<IndicatorInstance>>
  add: ChartController['addIndicator']
  remove: ChartController['removeIndicator']
  updateParams: ChartController['updateIndicatorParams']
} {
  const indicators = shallowRef(controller.indicators.peek()) as Ref<
    ReadonlyArray<IndicatorInstance>
  >
  const unsub = controller.indicators.subscribe(() => {
    indicators.value = controller.indicators.peek()
  })
  onScopeDispose(unsub)

  return {
    indicators,
    add: controller.addIndicator.bind(controller),
    remove: controller.removeIndicator.bind(controller),
    updateParams: controller.updateIndicatorParams.bind(controller),
  }
}

/**
 * Bridge the Chart's interactionState signal into a Vue shallowRef.
 * 仅当 snapshot 引用变化时更新（kernel 侧已做字段级短路与引用缓存）。
 */
export function useInteractionState(controller: ChartController): Ref<InteractionSnapshot> {
  const state = shallowRef(controller.interactionState.peek()) as Ref<InteractionSnapshot>
  const unsub = controller.interactionState.subscribe(() => {
    const next = controller.interactionState.peek()
    if (state.value === next) return
    state.value = next
  })
  onScopeDispose(unsub)
  return state
}

/**
 * Bridge the Chart's paneRatios signal into a Vue shallowRef.
 */
export function usePaneRatios(controller: ChartController): Ref<Readonly<Record<string, number>>> {
  const ratios = shallowRef(controller.paneRatios.peek()) as Ref<Readonly<Record<string, number>>>
  const unsub = controller.paneRatios.subscribe(() => {
    ratios.value = controller.paneRatios.peek()
  })
  onScopeDispose(unsub)
  return ratios
}

/**
 * Bridge the Chart's viewport signal into a Vue shallowRef.
 * 引用相等则跳过，配合 viewport 侧缓存减少滚动抖动更新。
 */
export function useViewport(controller: ChartController): Ref<ChartViewport> {
  const vp = shallowRef(controller.viewport.peek()) as Ref<ChartViewport>
  const unsub = controller.viewport.subscribe(() => {
    const next = controller.viewport.peek()
    if (vp.value === next) return
    vp.value = next
  })
  onScopeDispose(unsub)
  return vp
}

// ---------------------------------------------------------------------------
// useIndicatorSelector — composable
// ---------------------------------------------------------------------------

/**
 * Bridge the indicator selector signals into Vue refs.
 *
 * Creates an internal IndicatorSelectorController for menu/search/filter UI
 * state (catalog from `controller.catalog`), and delegates add/remove to the
 * ChartController engine methods.
 */
export function useIndicatorSelector(controller: ChartController): {
  catalog: ReadonlyArray<IndicatorDefinition>
  filteredMain: Ref<ReadonlyArray<IndicatorDefinition>>
  filteredSub: Ref<ReadonlyArray<IndicatorDefinition>>
  menuOpen: Ref<boolean>
  searchQuery: Ref<string>
  add: (definitionId: string) => string | null
  remove: (instanceId: string) => boolean
  openMenu: () => void
  closeMenu: () => void
  toggleMenu: () => void
  setSearchQuery: (q: string) => void
  isActive: (definitionId: string) => boolean
} {
  const selector = createIndicatorSelectorController({
    catalog: controller.catalog,
  })

  onScopeDispose(() => selector.dispose())

  const filteredMain = coreSignalToVueRef(selector.filteredMain)
  const filteredSub = coreSignalToVueRef(selector.filteredSub)
  const menuOpen = coreSignalToVueRef(selector.menuOpen)
  const searchQuery = coreSignalToVueRef(selector.searchQuery)

  function add(definitionId: string): string | null {
    const def = controller.catalog.find((d) => d.id === definitionId)
    if (def === undefined) return null
    return controller.addIndicator(definitionId, def.role)
  }

  function remove(instanceId: string): boolean {
    return controller.removeIndicator(instanceId)
  }

  function isActive(definitionId: string): boolean {
    return controller.indicators.peek().some((i) => i.definitionId === definitionId)
  }

  return {
    catalog: controller.catalog,
    filteredMain,
    filteredSub,
    menuOpen,
    searchQuery,
    add,
    remove,
    openMenu: () => selector.openMenu(),
    closeMenu: () => selector.closeMenu(),
    toggleMenu: () => selector.toggleMenu(),
    setSearchQuery: (q: string) => selector.setSearchQuery(q),
    isActive,
  }
}

// ---------------------------------------------------------------------------
// KMapPlugin �?legacy Vue plugin
//
// PRESERVE THIS EXACT SHAPE �?legacy consumers do:
//   import { KMapPlugin } from '@363045841yyt/klinechart'
//   app.use(KMapPlugin)
// ---------------------------------------------------------------------------

export const KMapPlugin = {
  install(app: App): void {
    app.component('KLineChart', KlineChart)
  },
}

// ---------------------------------------------------------------------------
// Auto-register the production ChartControllerFactory
//
// Consumers don't need to call __setControllerFactory manually unless they
// want to inject a custom backing (e.g. for testing). Contract tests
// override via __setControllerFactory in their setup and reset to null in
// afterEach, so this default registration is transparent to them.
//
// Importing the factory is side-effect-free at module load �?the engine's
// DOM access only happens when `createChart(opts)` is actually called.
// ---------------------------------------------------------------------------
import { createChartController } from '@363045841yyt/klinechart-core'
__setControllerFactory(createChartController)
export { VERSION, CORE_VERSION } from './version'
