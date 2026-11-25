/**
 * 计算层公共出口：契约、身份编码与 Hub 工厂。
 *
 * 这里只导出与视图无关的内容；图表、警报与 Agent 各自作为消费者接入。
 */
export {
  canonicalizeInput,
  createCalculationKey,
  createDataIdentity,
  createFeedKey,
  createLocalCalculationKey,
} from './impl/canonical.js'
export { createCalculationHub } from './impl/createCalculationHub.js'
export type {
  CalculationClient,
  CalculationClientHandlers,
  CalculationCommit,
  CalculationCompute,
  CalculationDefinition,
  CalculationFailure,
  CalculationHub,
  CalculationHubOptions,
  CalculationInputObject,
  CalculationInputs,
  CalculationInputValue,
  CalculationMarketData,
  CalculationOutput,
  CalculationRequest,
  CalculationResult,
  DataIdentity,
  FeedKey,
  FeedPlan,
  FeedSnapshot,
} from './types.js'
export type { ScriptAlertEvent } from '@363045841yyt/klinechart-plot-contracts'
