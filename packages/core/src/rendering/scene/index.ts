/**
 * Scene abstraction barrel.
 *
 * Exports the `Layer` / `Scene` types, the `createScene` factory, and the
 * `LayerRegistry` mechanism + canonical built-in layer typeIds. This is the
 * level above `render` and below `interaction` in the core dependency stack
 * — see `docs/ROADMAP.md` §0.
 */

export { createLayerFromPlugin } from './createLayerFromPlugin.js'

export { createScene } from './createScene.js'
export type { BuiltinLayerType, LayerFactory, LayerRegistry } from './layerRegistry.js'
export { BUILTIN_LAYER_TYPES, createLayerRegistry } from './layerRegistry.js'
export type { Layer, LayerRole, PaintContext, PaneRole, Scene } from './types.js'
