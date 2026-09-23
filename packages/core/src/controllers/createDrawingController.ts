/**
 * createDrawingController 兼容出口。
 *
 * 实现已迁移至 `drawing/` 语义模块，本文件仅作旧路径的转发出口，保证
 * `controllers/createDrawingController.js` 的直接导入不中断。
 */

export { createDrawingController } from './drawing/index.js'
export type { DrawingInit } from './drawing/types.js'
