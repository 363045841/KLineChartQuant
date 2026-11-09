/**
 * 脚本指标阶段：内置脚本与用户脚本共用同一对收集器/编译器。
 *
 * 收集只读文档快照；编译在 Worker 内完成并绑定计算入口；注册由统一管线执行。
 */
import type {
  IndicatorCandidate,
  IndicatorCompiler,
  IndicatorCollector,
  IndicatorFailure,
  IndicatorStage,
  RegistrableIndicator,
  StageResult,
} from '@363045841yyt/klinechart-core'
import { inspectScript } from '@363045841yyt/klinechart-script'
import type { SavedScript } from '../types.js'
import type { CompiledScriptIdentity, ScriptExecutor } from './scriptExecutor.js'

/** 创建脚本阶段所需的源码快照与执行器。 */
export interface ScriptIndicatorStageRequest {
  /** 构建期打包的内置脚本源码。 */
  readonly builtinSources: readonly string[]
  /** 已恢复的用户脚本；只读取编译所需字段。 */
  readonly documents: readonly SavedScript[]
  readonly executor: ScriptExecutor
}

/** 读取脚本声明中的名称；解析失败时退回稳定键，保证失败日志可定位。 */
function describeSource(source: string, fallback: string): string {
  try {
    return inspectScript(source).name || fallback
  } catch {
    return fallback
  }
}

/** 内置脚本的稳定键；内置源码没有文档 ID。 */
function builtinKey(index: number): string {
  return `builtin#${index}`
}

/**
 * 创建脚本阶段。
 *
 * @param request 内置源码、用户文档与执行器
 * @returns 形状统一的两段式指标阶段
 */
export function createScriptIndicatorStage(
  request: ScriptIndicatorStageRequest,
): IndicatorStage {
  const { builtinSources, documents, executor } = request
  const byId = new Map(documents.map((item) => [item.id, item]))

  const collector: IndicatorCollector = {
    origin: 'user-script',
    async collect(): Promise<StageResult<IndicatorCandidate>> {
      const candidates: IndicatorCandidate[] = [
        ...builtinSources.map((source, index) => ({
          key: builtinKey(index),
          origin: 'builtin-script' as const,
          identity: 'builtin' as const,
          sourceText: source,
          trusted: true,
        })),
        ...[...byId.values()].map((document) => ({
          key: document.id,
          origin: 'user-script' as const,
          identity: 'user' as const,
          sourceText: document.source,
          trusted: document.trusted,
        })),
      ]
      return { ok: true, items: candidates }
    },
  }

  const compiler: IndicatorCompiler = {
    origin: 'user-script',
    async compile(item) {
      const source = item.sourceText
      if (source === undefined) {
        return { ok: false, failure: failure(item, item.key, new Error('脚本候选缺少源码')) }
      }
      const document = byId.get(item.key)
      let handle: string | undefined
      try {
        const compiled = await executor.compile(source, item.trusted === true)
        handle = compiled.handle
        const identity: CompiledScriptIdentity = document
          ? {
              id: document.id,
              source: document.source,
              revision: document.revision,
              identity: 'user',
              trusted: document.trusted,
              folder: document.folder,
            }
          : {
              id: compiled.definition.name,
              source,
              revision: 1,
              identity: item.identity === 'builtin' ? 'builtin' : 'user',
              trusted: item.trusted === true,
              folder: '',
            }
        const definition = await executor.createDefinition(compiled, identity)
        const registrable: RegistrableIndicator = { kind: 'definition', candidate: item, definition }
        return { ok: true, items: [registrable] }
      } catch (error) {
        // 编译失败释放独立句柄；注册失败由注册阶段返回，不在这里吞掉。
        if (handle !== undefined) await executor.releaseHandle(handle)
        return { ok: false, failure: failure(item, describeSource(source, item.key), error) }
      }
    },
  }

  return { collector, compiler }
}

/** 构造失败记录；阶段名固定为编译，来源与键来自候选。 */
function failure(
  candidate: Pick<IndicatorCandidate, 'origin' | 'key'>,
  name: string,
  error: unknown,
): IndicatorFailure {
  return { stage: 'compile', origin: candidate.origin, key: candidate.key, name, error }
}
