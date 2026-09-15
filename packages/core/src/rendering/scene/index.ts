/**
 * Scene abstraction barrel.
 *
 * Exports the `Layer` / `Scene` types, the `createScene` factory, and the
 * `LayerRegistry` mechanism + canonical built-in layer typeIds. This is the
 * level above `render` and below `interaction` in the core dependency stack
 * — see `docs/ROADMAP.md` §0.
 */

export { createLayerFromPlugin } from './createLayerFromPlugin'

export { createScene } from './createScene'
export type { BuiltinLayerType, LayerFactory, LayerRegistry } from './layerRegistry'
export { BUILTIN_LAYER_TYPES, createLayerRegistry } from './layerRegistry'
export type { Layer, LayerRole, PaintContext, PaneRole, Scene } from './types'
