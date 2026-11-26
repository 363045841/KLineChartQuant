/**
 * 指标注册管线对外入口：阶段契约、注册执行与类型。
 *
 * 可写定义仓库是独立的 `DefinitionRegistry` 实例，由运行时持有。
 */
export { createPlotIndicatorDefinition } from './impl/createPlotDefinition.js'
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
