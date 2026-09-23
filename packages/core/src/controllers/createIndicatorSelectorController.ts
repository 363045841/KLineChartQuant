/**
 * 兼容出口：createIndicatorSelectorController 已迁移至 indicatorSelector/ 模块。
 *
 * 本文件保留既有导入路径，实现与契约分别见
 * `./indicatorSelector/impl/createIndicatorSelectorController.js` 与
 * `./indicatorSelector/types.js`。新代码请直接从 `./indicatorSelector/index.js` 导入。
 */

export { createIndicatorSelectorController } from './indicatorSelector/index.js'
export type { IndicatorSelectorInit } from './indicatorSelector/types.js'
