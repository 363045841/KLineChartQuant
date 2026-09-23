/**
 * createToolbarController 兼容出口。
 *
 * 实现已迁移至 `toolbar/` 语义模块，本文件仅作旧路径的转发出口，保证
 * `controllers/createToolbarController.js` 的直接导入不中断。
 */

export { createToolbarController } from './toolbar/index.js'
export type { ToolbarInit } from './toolbar/types.js'
