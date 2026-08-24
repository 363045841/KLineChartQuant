// 本文件保留 Agent 指标查询的原模块入口，具体实现位于 indicator/ 目录。

export {
  createIndicatorQuery,
  type IndicatorQuery,
  type IndicatorQueryDependencies,
} from './indicator/indicatorQuery'
export type { IndicatorQueryInput } from './types'
