/**
 * 指标注册管线对外入口：阶段契约、注册写入口、目录读取与变更通知。
 */

export { createPlotIndicatorDefinition } from './impl/createPlotDefinition.js'
export {
  clearIndicatorStoreForTest,
  getIndicatorDescriptor,
  getRegisteredIndicatorDefinition,
  indicatorCatalogRevision,
  indicatorCommits,
  indicatorFailures,
  isIndicatorDefinitionLoaded,
  loadAllIndicatorDefinitions,
  loadIndicatorDefinitions,
  readIndicatorDescriptors,
  readRegisteredDefinitions,
  registerIndicators,
  resolveCanonicalIndicatorId,
  resolveIndicatorDefinitionId,
  setIndicatorFailures,
  unregisterIndicator,
} from './impl/indicatorStore.js'
export { logIndicatorFailure, runIndicatorPipeline } from './impl/runIndicatorPipeline.js'
export type {
  IndicatorCandidate,
  IndicatorCatalogCommit,
  IndicatorCatalogCommitSignal,
  IndicatorCatalogRevision,
  IndicatorCollector,
  IndicatorCompiler,
  IndicatorDefinitionLoader,
  IndicatorDescriptor,
  IndicatorDocumentIdentity,
  IndicatorFailure,
  IndicatorFailureSignal,
  IndicatorIdentity,
  IndicatorOrigin,
  IndicatorPipelineReport,
  IndicatorStage,
  IndicatorStageName,
  RegistrableIndicator,
  StageResult,
} from './types.js'
