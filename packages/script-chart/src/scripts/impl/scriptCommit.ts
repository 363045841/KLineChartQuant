/**
 * 脚本提交的唯一装配点：候选身份、编译身份、持久化字段与注册失败共用一套构造。
 *
 * 目录服务、库保存与启动管线只决定“写什么”，不再各自拼同一组字段。
 */
import {
  type DefinitionRegistry,
  type IndicatorCandidate,
  type RegistrableIndicator,
} from '@363045841yyt/klinechart-core/node'
import type { SavedScript, ScriptDocument } from '../types.js'
import type { CompiledScript, CompiledScriptIdentity } from './scriptExecutor.js'

/** 脚本指标的稳定候选身份；注册表与失败清单共用。 */
export function scriptCandidate(key: string): IndicatorCandidate {
  return { key, origin: 'user-script', identity: 'user' }
}

/** 由文档快照生成编译身份；revision 可覆盖为本次提交版本。 */
export function documentIdentity(
  document: ScriptDocument,
  revision = document.revision,
): CompiledScriptIdentity {
  return {
    id: document.id,
    source: document.source,
    revision,
    identity: document.identity,
    trusted: document.trusted,
    folder: document.folder,
  }
}

/** 启动恢复的持久化文档都属于用户脚本，身份固定为 user。 */
export function savedIdentity(
  document: SavedScript,
  revision = document.revision,
): CompiledScriptIdentity {
  return {
    id: document.id,
    source: document.source,
    revision,
    identity: 'user',
    trusted: document.trusted,
    folder: document.folder,
  }
}

/** 没有持久化文档的候选（内置脚本）身份取自编译声明与候选信任状态。 */
export function candidateIdentity(
  compiled: CompiledScript,
  candidate: IndicatorCandidate,
  source: string,
): CompiledScriptIdentity {
  return {
    id: compiled.definition.name,
    source,
    revision: 1,
    identity: candidate.identity === 'builtin' ? 'builtin' : 'user',
    trusted: candidate.trusted === true,
    folder: '',
  }
}

/** 一次性注册全部定义；首个失败直接抛出，调用方负责回滚未提交的句柄。 */
export function commitIndicators(
  definitions: DefinitionRegistry,
  items: readonly RegistrableIndicator[],
): void {
  const [failure] = definitions.register(items).failures
  if (failure) throw failure.error
}

/** 持久化只保存可序列化字段，形状跟随公共文档契约。 */
export function toSavedScript(document: ScriptDocument): SavedScript {
  return {
    id: document.id,
    source: document.source,
    revision: document.revision,
    trusted: document.trusted,
    folder: document.folder,
  }
}
