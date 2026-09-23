/**
 * chart 模块公共出口。
 *
 * 对外暴露 ChartController 工厂实现与 chart 契约类型；调用方应从本模块导入，
 * 避免直接依赖 impl/ 下的实现文件。
 */

export { createChartController } from './impl/createChartController.js'
export type * from './types.js'
