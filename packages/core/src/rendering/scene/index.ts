/**
 * Scene 抽象 barrel。
 *
 * 导出 Layer/Scene、统一合成目标层序与 Scene 工厂。
 */

export { createScene } from './createScene.js'
export {
  type FramePaint,
  LAYER_PANE_GLOBAL,
  type Layer,
  type LayerPaint,
  type LayerPane,
  type LayerRole,
  SCENE_PAINT_TARGETS,
  SCENE_TARGET_Z,
  type Scene,
  type SceneFrame,
  type ScenePaintTarget,
  scenePaintTarget,
} from './types.js'
