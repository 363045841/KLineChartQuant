/** 实例级 Layer 操作契约，供引擎、宿主和插件共用。 */
import type { RenderContext } from '../../foundation/plugin/types.js'
import type { Layer } from '../../rendering/scene/types.js'

/** PluginHost 中实例级渲染能力的服务标识。 */
export const CHART_RENDERERS_SERVICE = 'chart:renderers'

/** 所有查询和移除均使用完整 Layer.id，不转换名称或添加前缀。 */
export interface ChartRendererAccess {
  /** 挂载 Layer；同 ID 首个实例胜出，未挂载的实例由调用方释放。 */
  useRenderer(layer: Layer<RenderContext>): void
  /** 移除并释放 Layer，同时请求重绘。 */
  removeRenderer(id: string): void
  /** 查询挂载的 Layer；不存在时返回 undefined。 */
  getRenderer(id: string): Layer<RenderContext> | undefined
  /** 私有数据或可见性变化后请求完整重绘，连续调用由 RAF 合并。 */
  requestRender(): void
}
