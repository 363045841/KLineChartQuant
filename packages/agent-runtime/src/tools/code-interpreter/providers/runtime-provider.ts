// 本文件定义运行时抽象：Service 只依赖此接口，新增 Provider 不修改 Service。
import type { Artifact, InputFile } from '../contract.js'

/**
 * Provider 的能力自述。
 * `maxInline*Bytes` 驱动分级传输选路；`enforcesNetworkPolicy` 把「平台保证」
 * 与「我们自己做」的区别编码进类型，而不是留在注释里（design.md §2）。
 */
export interface ProviderCapabilities {
  /** exec 通道输入上限（字节）。 */
  readonly maxInlineInputBytes: number
  /** exec 通道单个产物上限（字节）。 */
  readonly maxInlineOutputBytes: number
  /** 是否支持挂载通道，用于承载超出 inline 上限的输入与产物。 */
  readonly supportsMount: boolean
  /** true = 出站阻断由平台保证；false = 由本项目的 runner 自建（可信基不同）。 */
  readonly enforcesNetworkPolicy: boolean
}

/** 已归一化的执行规格：Service 完成校验与选路后交给 Provider。 */
export interface ExecutionSpec {
  readonly taskId: string
  readonly language: 'python'
  readonly code: string
  readonly files: readonly InputFile[]
  readonly timeoutMs: number
  /** 沙箱内看门狗触发时刻，触发后以 SOFT_TIMEOUT_EXIT_CODE 退出。 */
  readonly softTimeoutMs: number
  readonly memoryMb: number
  /** 输入与产物的传输通道，由 ProviderCapabilities 选出。 */
  readonly channel: 'inline' | 'mount'
}

/** Provider 对一次执行的引用；`ref` 由各 Provider 自行定义。 */
export interface ProviderHandle {
  readonly taskId: string
  readonly providerId: RuntimeProviderId
  readonly ref: unknown
}

export type ProviderStatus =
  | { readonly state: 'queued' }
  | { readonly state: 'running' }
  | {
      readonly state: 'exited'
      readonly exitCode: number
      readonly stdout: string
      readonly stderr: string
      readonly artifacts: readonly Artifact[]
      readonly durationMs: number
      readonly memoryMb?: number
    }

export type RuntimeProviderId = 'local' | 'fly-machines' | 'cloud-run-sandbox'

export interface RuntimeProvider {
  readonly id: RuntimeProviderId
  readonly capabilities: ProviderCapabilities
  start(spec: ExecutionSpec, signal: AbortSignal): Promise<ProviderHandle>
  poll(handle: ProviderHandle): Promise<ProviderStatus>
  /** 终止执行；终态由 Service 依据自己记录的意图判定，不取决于本调用的返回。 */
  kill(handle: ProviderHandle, reason: 'cancel' | 'timeout'): Promise<void>
}
