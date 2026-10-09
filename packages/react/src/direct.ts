/**
 * 只含直接挂载 Core 的入口，不引用 Vue Web Component。
 *
 * Metro 等不做 tree-shaking 的打包器会跟随 KLineChartWC 的动态导入把整套 Vue UI（含字体）
 * 打进产物；React Native / Expo DOM component 宿主应从此入口导入。
 */

export {
  KLineChart,
  type KLineChartHandle,
  type KLineChartOptions,
  type KLineChartProps,
  useCoreSignal,
  useKLineChart,
} from './KLineChart.js'
