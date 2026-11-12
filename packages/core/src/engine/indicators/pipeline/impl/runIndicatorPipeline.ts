/**
 * 管线编排：收集全部来源 → 逐条编译 → 一次注册。
 *
 * 阶段之间只传数据；任何单条失败都记录在结果里并继续，不中断整批。
 */
import type {
  IndicatorFailure,
  IndicatorPipelineReport,
  IndicatorStage,
  RegistrableIndicator,
} from '../types.js'
import { registerIndicators, setIndicatorFailures } from './indicatorStore.js'

/** 打印一条阶段失败，格式固定，便于按阶段与来源检索。 */
export function logIndicatorFailure(failure: IndicatorFailure): void {
  console.error(
    `[IndicatorPipeline] ${failure.stage} 阶段失败：${failure.origin}/${failure.key}（${failure.name}）`,
    failure.error,
  )
}

/**
 * 运行指标管线。
 *
 * @param stages 需要注册的全部来源；每个来源自带收集器与编译器
 * @returns 已提交目录项与全部阶段失败
 */
export async function runIndicatorPipeline(
  stages: readonly IndicatorStage[],
): Promise<IndicatorPipelineReport> {
  const registrable: RegistrableIndicator[] = []
  const failures: IndicatorFailure[] = []

  for (const stage of stages) {
    const collected = await stage.collector.collect()
    if (!collected.ok) {
      failures.push(collected.failure)
      continue
    }
    for (const candidate of collected.items) {
      const compiled = await stage.compiler.compile(candidate)
      if (!compiled.ok) {
        failures.push(compiled.failure)
        continue
      }
      registrable.push(...compiled.items)
    }
  }

  const report = registerIndicators(registrable)
  const all = [...failures, ...report.failures]
  for (const failure of all) logIndicatorFailure(failure)
  setIndicatorFailures(all)
  return { committed: report.committed, failures: all }
}
