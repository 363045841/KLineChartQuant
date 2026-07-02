import { KLineChartError } from '../errors'
/**
 * Layer factory registry.
 *
 * The registry is a tiny lookup table from a stable string `typeId` to a
 * factory function that builds a `Layer` instance. It exists so that:
 *
 * 1. Chart adapters can choose which built-in layer types to wire in,
 *    rather than the core forcing all of them on every consumer.
 * 2. Component layers built by sibling agents (Volume Profile, Order Book
 *    Heatmap, Footprint) register their factories without touching the
 *    scene code itself — the registry is the integration point.
 * 3. The registry is decoupled from `Scene`: a factory produces a `Layer`;
 *    the consumer is responsible for calling `scene.addLayer(layer)`. This
 *    avoids forcing every consumer through a single "register + auto-add"
 *    pipeline that would be hard to compose with config-driven scenes.
 *
 * This PR does NOT pre-register any factories — that's a follow-up PR
 * once the legacy WebGL renderers have adapters that satisfy the `Layer`
 * interface. This file ships the registry mechanism plus the canonical
 * `typeId` constants so the rest of the codebase can reference layer types
 * by symbol rather than magic string.
 */

import type { Layer, LayerRole } from './types'

/**
 * A layer factory turns a typed config into a `Layer`.
 *
 * `TConfig` is parameterised so factories can declare their own config
 * shape (e.g. the Volume Profile factory takes `{ store, bins, modes }`).
 * The registry stores factories with `unknown` config — callers know which
 * factory they're calling and cast on retrieval.
 */
export interface LayerFactory<TConfig = unknown> {
  /** Stable id for this layer TYPE (not instance) — e.g. 'volume-profile'. */
  typeId: string
  role: LayerRole
  /** Create a Layer instance; consumers pass any config + their store ref. */
  create(config: TConfig): Layer
}

export interface LayerRegistry {
  /**
   * Register a factory. Returns nothing on success.
   * Throws on duplicate `typeId` — duplicates are programmer errors
   * (two systems trying to claim the same layer type id), not runtime
   * conditions to be silently handled. The error message names the
   * conflicting typeId so the caller can locate it.
   */
  register(factory: LayerFactory): void
  /**
   * Remove a factory by typeId. Returns true if a factory was removed,
   * false if no such typeId was registered.
   */
  unregister(typeId: string): boolean
  /** Look up a factory by typeId. Returns null when not registered. */
  get(typeId: string): LayerFactory | null
  /** Snapshot of all registered factories. Safe to iterate; do not mutate. */
  list(): ReadonlyArray<LayerFactory>
}

export function createLayerRegistry(): LayerRegistry {
  // Map preserves insertion order, which makes `list()` deterministic —
  // useful for snapshot tests and for UI surfaces (e.g. an "available
  // layers" picker) that render the list in registration order.
  const factories = new Map<string, LayerFactory>()

  const register = (factory: LayerFactory): void => {
    if (factories.has(factory.typeId)) {
      throw new KLineChartError(
        'NOT_REGISTERED',
        `LayerRegistry: typeId "${factory.typeId}" is already registered`,
      )
    }
    factories.set(factory.typeId, factory)
  }

  const unregister = (typeId: string): boolean => factories.delete(typeId)

  const get = (typeId: string): LayerFactory | null => factories.get(typeId) ?? null

  const list = (): ReadonlyArray<LayerFactory> =>
    [...factories.values()] as ReadonlyArray<LayerFactory>

  return { register, unregister, get, list }
}

/**
 * Canonical typeIds for the layer types this codebase intends to ship.
 *
 * Grouped into:
 * - "builtin:" — layers backed by existing v0 WebGL renderers (will arrive
 *   via adapter factories in a follow-up PR).
 * - "component:" — the three P1 differentiating components from ROADMAP §3.
 *
 * These are string constants (not enums) so external code can pass through
 * string literal types without an enum import — useful for config blobs.
 */
export const BUILTIN_LAYER_TYPES = {
  // Existing in v0 (handled by legacy renderers)
  CANDLE: 'builtin:candle',
  VOLUME: 'builtin:volume',
  INDICATOR_MA: 'builtin:indicator:ma',
  INDICATOR_BOLL: 'builtin:indicator:boll',
  DRAWING: 'builtin:drawing',
  CROSSHAIR: 'builtin:crosshair',
  GRID: 'builtin:grid',
  // P1 component layers (controllers from sibling agents will provide factories)
  VOLUME_PROFILE: 'component:volume-profile',
  ORDER_BOOK_HEATMAP: 'component:order-book-heatmap',
  FOOTPRINT: 'component:footprint',
} as const

export type BuiltinLayerType = (typeof BUILTIN_LAYER_TYPES)[keyof typeof BUILTIN_LAYER_TYPES]
