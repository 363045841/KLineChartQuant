/**
 * Scene + Layer type definitions.
 *
 * The scene is the level above `render` in core's dependency stack
 * (see `docs/ROADMAP.md` §0):
 *
 *     interaction → store → scene → render
 *
 * A `Layer` is a self-contained drawing module — candles, volume bars,
 * indicator plots, drawings, crosshair, and the P1 component layers
 * (Volume Profile, Order Book Heatmap, Footprint) all conform to the same
 * shape. The scene composes layers, owns ordering, and drives per-frame
 * paint dispatch; it does NOT know which GPU backend is underneath
 * because `paint()` only sees a `Renderer` reference via `PaintContext`.
 *
 * This file is **pure interface** — `createScene.ts` implements `Scene`,
 * but the types here are zero-runtime so framework adapters and indicator
 * controllers can compile against them without pulling in the implementation.
 */

import type { Signal } from '../reactivity/signal'
import type { Renderer } from '../render/Renderer'
import type { SurfaceRegion } from '../render/SurfaceBackend'

/**
 * Roles let the scene group layers and let other systems target them
 * (e.g. picking ignores `background`; drawings live above indicators).
 *
 * The ordering here is informational, not enforced — z-order is the
 * authoritative paint order. Roles exist so a follow-up PR can build
 * features like "hit-test only drawing + component layers" without
 * peeking at layer ids.
 */
export type LayerRole =
  | 'background' // grid, axes
  | 'primary' // candles, volume bars
  | 'indicator' // MA, BOLL, indicator-defined plots
  | 'component' // Volume Profile, Heatmap, Footprint
  | 'drawing' // user drawings
  | 'overlay' // crosshair, hover, legends

/**
 * Which pane a layer belongs to. The chart has a main pane (candles +
 * primary indicators) and zero-or-more sub panes (volume, RSI, MACD).
 * Layers declare their pane statically; the scene's `paintPane` filters
 * by this field so each pane's region only sees its own layers.
 *
 * NOTE for implementations: this PR uses a flat 'main' / 'sub' split.
 * If a future iteration needs to address a specific sub-pane (e.g. the
 * volume pane vs the RSI pane), extend this to a string id (e.g. 'sub:rsi')
 * — the Layer / Scene contract here does not pre-commit a multi-sub-pane
 * scheme on purpose.
 */
export type PaneRole = 'main' | 'sub' | 'global'

/**
 * Stateless paint context handed to each layer per frame.
 *
 * The layer reads what it needs from the store via subscriptions
 * (the store reference is held by the layer itself, set up at construction
 * time by its factory); this context is the per-frame state.
 *
 * Invariants:
 * - `renderer` MUST already be inside a `beginFrame` / `endFrame` pair
 *   when paint runs. The scene does not call beginFrame/endFrame itself —
 *   that's the chart engine's responsibility (see `docs/ROADMAP.md` §0
 *   for the layered call chain).
 * - `region` is the surface region for the pane currently being painted.
 *   Layers MUST treat all coordinates as logical pixels relative to this
 *   region's origin (the renderer's surface handles DPR scaling).
 * - `frameNumber` is monotonic across the chart's lifetime; layers can use
 *   it to drive animations or detect skipped frames.
 * - `deltaMs` is the wall-clock delta since the previous paint of any pane,
 *   in milliseconds. May be `0` on the very first frame.
 */
export interface PaintContext {
  renderer: Renderer
  region: SurfaceRegion
  paneRole: PaneRole
  /** The pane id being painted (e.g. 'main', 'RSI_0') — used by sub-pane layers */
  paneId: string
  /** monotonically increasing frame counter for animation/timing */
  frameNumber: number
  /** time elapsed since last frame in ms (for animations) */
  deltaMs: number
}

/**
 * A Layer is a self-contained drawing module.
 *
 * The contract:
 * - Pure function `paint()`: given context, produce GPU commands.
 * - `paint()` MUST NOT mutate any shared state visible to other layers.
 *   Layer-private state (cached buffers, last-seen frame number) is fine.
 * - `paint()` runs in scene-defined order; order matters for visual stacking
 *   (lower z paints first, so higher-z layers visually sit on top).
 * - `dispose()` MUST release any renderer resources the layer allocated
 *   (buffers, pipelines). After dispose, the layer is dead — the scene
 *   removes it and will not call paint again.
 * - `visible` is a runtime toggle. Invisible layers are skipped entirely
 *   (no paint() call); the layer keeps its allocated resources so a flip
 *   back to visible is cheap.
 */
export interface Layer {
  readonly id: string
  readonly role: LayerRole
  /** which pane this layer belongs to */
  readonly paneRole: PaneRole
  /** lower z first; ties broken by registration order */
  readonly z: number
  /** quick toggle without removing the layer from the scene */
  visible: boolean

  paint(ctx: PaintContext): void
  dispose(): void
}

/**
 * The Scene composes layers and exposes them to subscribers via a Signal.
 *
 * Add/remove operations produce a NEW array on the `layers` signal — never
 * mutate the previous value in place. This guarantees framework adapters
 * (React, Vue, Angular) using `Object.is` equality detect changes correctly.
 *
 * `paintPane` is the only entry point that draws anything; it filters layers
 * by `paneRole`, drops invisible layers, and dispatches in z order with ties
 * broken by registration order (FIFO stable sort).
 *
 * `dispose` tears down every layer the scene currently owns and freezes the
 * scene — subsequent add/remove/setLayerVisibility/paintPane calls are silent
 * no-ops. This matches the renderer's "dispose freezes the object" semantics.
 */
export interface Scene {
  readonly layers: Signal<ReadonlyArray<Layer>>

  addLayer(layer: Layer): void
  removeLayer(id: string): boolean
  getLayer(id: string): Layer | null
  setLayerVisibility(id: string, visible: boolean): boolean

  /**
   * paint layers for one pane in z-order, then by registration order
   * @param roles - if provided, only paint layers whose role is in this list
   */
  paintPane(ctx: PaintContext, roles?: ReadonlyArray<LayerRole>): void

  dispose(): void
}
