/** frame 模块公开入口：帧渲染器与投影版本契约。 */
export { ChartRenderer, mergeUpdateLevel } from './impl/chartRenderer.js'
export {
  createProjectionRevision,
  sameProjectionRevision,
} from './impl/retainedProjection.js'
export type { ProjectionRevision, RendererDependencies, ResolvedChartOptions } from './types.js'
