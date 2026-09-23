/**
 * toolbar 模块公共出口。
 *
 * 对外暴露 ToolbarController 工厂实现与 toolbar 契约类型；调用方应从本模块
 * 导入，避免直接依赖 impl/ 下的实现文件。
 */

export { createToolbarController } from './impl/createToolbarController.js'
export type * from './types.js'
