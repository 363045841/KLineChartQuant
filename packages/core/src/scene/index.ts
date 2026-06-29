/**
 * Scene abstraction barrel.
 *
 * Exports the `Layer` / `Scene` types, the `createScene` factory, and the
 * `LayerRegistry` mechanism + canonical built-in layer typeIds. This is the
 * level above `render` and below `interaction` in the core dependency stack
 * — see `docs/ROADMAP.md` §0.
 */

export type { Layer, LayerRole, PaneRole, PaintContext, Scene } from './types'

export { createScene } from './createScene'

export { createLayerRegistry, BUILTIN_LAYER_TYPES } from './layerRegistry'

export type { LayerFactory, LayerRegistry, BuiltinLayerType } from './layerRegistry'

export { createLayerFromPlugin } from './createLayerFromPlugin'
