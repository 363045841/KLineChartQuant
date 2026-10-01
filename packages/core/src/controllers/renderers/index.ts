/**
 * renderers 模块公共出口。
 *
 * 对外暴露实例级渲染能力读取函数与模块契约类型；调用方应从本模块导入，
 * 避免直接依赖 impl/ 下的实现文件。
 */

export { getChartRenderers } from './impl/getChartRenderers.js'
export { CHART_RENDERERS_SERVICE, type ChartRendererAccess } from './types.js'
