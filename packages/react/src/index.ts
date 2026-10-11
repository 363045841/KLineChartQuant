/** React 适配器公共入口：直接挂载 Core 的 KLineChart，以及封装 Vue Web Component 的 KLineChartWC。 */

export {
  KLineChart,
  type KLineChartHandle,
  type KLineChartOptions,
  type KLineChartProps,
  useCoreSignal,
  useKLineChart,
} from './KLineChart.js'
export { KLineChartWC, type KLineChartWCHandle, type KLineChartWCProps } from './KLineChartWC.js'
