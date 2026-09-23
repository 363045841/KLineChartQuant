/**
 * drawing 模块公共出口。
 *
 * 对外暴露 DrawingController 工厂实现与 drawing 契约类型；调用方应从本模块
 * 导入，避免直接依赖 impl/ 下的实现文件。
 */

export { createDrawingController } from './impl/createDrawingController.js'
export type * from './types.js'
