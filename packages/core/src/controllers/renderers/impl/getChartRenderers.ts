/** 从图表插件宿主获取正式的实例级渲染能力。 */
import { GENERIC_ERROR_CODES, KLineChartError } from '../../../errors.js'
import type { PluginHost } from '../../../foundation/plugin/types.js'
import { CHART_RENDERERS_SERVICE, type ChartRendererAccess } from '../types.js'

/** 供 Plugin.install 调用；非图表宿主没有渲染服务时明确报错。 */
export function getChartRenderers(host: PluginHost): ChartRendererAccess {
  const renderers = host.getService<ChartRendererAccess>(CHART_RENDERERS_SERVICE)
  if (!renderers) {
    throw new KLineChartError(
      GENERIC_ERROR_CODES.NOT_REGISTERED,
      'Chart renderer service is not registered on this plugin host',
    )
  }
  return renderers
}
