/**
 * 系统指标阶段：把构建期生成的静态目录转成候选与可注册目录项。
 *
 * 系统指标的实现在构建期已编译，运行期只做校验与装配，因此收集与编译都是同步的；
 * 真正的实现由目录项的 `load` 在用户添加时懒加载。
 */
import { GENERIC_ERROR_CODES, KLineChartError } from '@/errors.js'
import { BUILTIN_INDICATOR_MANIFEST } from '@/engine/indicators/generated/builtinIndicators.js'
import type {
  IndicatorCandidate,
  IndicatorCompiler,
  IndicatorCollector,
  IndicatorFailure,
  IndicatorStage,
  RegistrableIndicator,
  StageResult,
} from '../types.js'

/** 收集构建期清单中的系统指标候选；不读取任何实现。 */
export function collectSystemCandidates(): readonly IndicatorCandidate[] {
  return BUILTIN_INDICATOR_MANIFEST.map((entry) => ({
    key: entry.descriptor.name,
    origin: 'system',
    identity: 'native',
    load: entry.load,
  }))
}

/**
 * 编译系统指标候选：校验名称并把构建期目录项原样交给注册阶段。
 *
 * @param candidate 收集阶段产出的系统候选
 * @returns 只登记目录项的可注册结果
 */
export function compileSystemCandidate(candidate: IndicatorCandidate): RegistrableIndicator {
  const entry = BUILTIN_INDICATOR_MANIFEST.find((item) => item.descriptor.name === candidate.key)
  if (!entry) {
    throw new KLineChartError(
      GENERIC_ERROR_CODES.INVALID_PARAM,
      `系统指标清单缺少条目：${candidate.key}`,
    )
  }
  if (!entry.descriptor.name.trim()) {
    throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, '系统指标目录项缺少名称')
  }
  return { kind: 'descriptor', candidate, descriptor: entry.descriptor, load: entry.load }
}

/** 同步装配全部系统指标；清单来自生成器，非法条目属于构建错误，直接抛出。 */
export function systemIndicators(): readonly RegistrableIndicator[] {
  return collectSystemCandidates().map(compileSystemCandidate)
}

/** 把系统指标包装成标准阶段，供统一管线与测试使用。 */
export function createSystemIndicatorStage(): IndicatorStage {
  const collector: IndicatorCollector = {
    origin: 'system',
    async collect(): Promise<StageResult<IndicatorCandidate>> {
      return { ok: true, items: collectSystemCandidates() }
    },
  }
  const compiler: IndicatorCompiler = {
    origin: 'system',
    async compile(candidate) {
      try {
        return { ok: true, items: [compileSystemCandidate(candidate)] }
      } catch (error) {
        const failure: IndicatorFailure = {
          stage: 'compile',
          origin: 'system',
          key: candidate.key,
          name: candidate.key,
          error,
        }
        return { ok: false, failure }
      }
    },
  }
  return { collector, compiler }
}
