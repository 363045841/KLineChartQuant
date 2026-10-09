/**
 * Scene 抽象 barrel。
 *
 * 导出 `Layer` / `Scene` 类型、`createScene` 工厂，以及 `LayerRegistry` 机制与
 * 内置 layer typeId。位于 core 依赖栈中 `render` 之上、`interaction` 之下。
 */

export { createScene } from './createScene.js'
export {
  type FramePaint,
  LAYER_PANE_GLOBAL,
  type Layer,
  type LayerPaint,
  type LayerPane,
  type LayerRole,
  type Scene,
  type SceneFrame,
} from './types.js'
