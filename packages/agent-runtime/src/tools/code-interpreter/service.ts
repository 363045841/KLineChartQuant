// 本文件实现 Provider 无关的代码解释器控制面：状态机、超时意图与结果归一化。
import {
  type Artifact,
  type CodeInterpreter,
  DEFAULT_MEMORY_MB,
  DEFAULT_TIMEOUT_MS,
  ExecutionRejectedError,
  type ExecutionRequest,
  type ExecutionResult,
  type ExecutionStatus,
  type ExecutionTask,
  MAX_TIMEOUT_MS,
  SOFT_TIMEOUT_EXIT_CODE,
  UnknownTaskError,
} from './contract.js'
import type {
  ExecutionSpec,
  ProviderHandle,
  RuntimeProvider,
} from './providers/runtime-provider.js'
import { applyArtifactPolicy, selectChannel, truncateStream } from './transport/channel.js'

/** 控制面记录的终止意图；平台区分不了超时与取消，谁先发起就记谁（design.md §3.1）。 */
type KillIntent = 'cancel' | 'timeout'

interface TaskRecord {
  readonly handle: ProviderHandle
  readonly controller: AbortController
  readonly startedAt: number
  intent?: KillIntent
  timer?: ReturnType<typeof setTimeout>
  result?: ExecutionResult
}

export interface CodeInterpreterServiceOptions {
  readonly provider: RuntimeProvider
  readonly now?: () => number
  readonly newTaskId?: () => string
}

/** 软超时留给沙箱自行收尾的余量；预算不足 5s 时按比例压缩（design.md §3.1）。 */
function softTimeoutFor(timeoutMs: number): number {
  return timeoutMs > 5000 ? timeoutMs - 5000 : Math.max(1, Math.floor(timeoutMs * 0.8))
}

function normalize(request: ExecutionRequest): Omit<ExecutionSpec, 'taskId' | 'channel'> {
  if (request.language !== 'python') {
    throw new ExecutionRejectedError(`Unsupported language: ${String(request.language)}`)
  }
  if (request.policy && request.policy.network !== 'disabled') {
    throw new ExecutionRejectedError('policy.network only accepts "disabled".')
  }
  if (request.policy && request.policy.packages !== 'base') {
    throw new ExecutionRejectedError('policy.packages only accepts "base".')
  }
  const timeoutMs = Math.min(request.limits?.timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS)
  if (timeoutMs <= 0) {
    throw new ExecutionRejectedError('limits.timeoutMs must be positive.')
  }
  return {
    language: 'python',
    code: request.code,
    files: request.files ?? [],
    timeoutMs,
    softTimeoutMs: softTimeoutFor(timeoutMs),
    memoryMb: request.limits?.memoryMb ?? DEFAULT_MEMORY_MB,
  }
}

/**
 * 代码解释器服务。只依赖 `RuntimeProvider` 接口，**不含任何 Provider 分支判断**；
 * 新增 Provider 无需修改本文件（PRD R1）。
 */
export class CodeInterpreterService implements CodeInterpreter {
  readonly #provider: RuntimeProvider
  readonly #now: () => number
  readonly #newTaskId: () => string
  readonly #tasks = new Map<string, TaskRecord>()

  constructor(options: CodeInterpreterServiceOptions) {
    this.#provider = options.provider
    this.#now = options.now ?? (() => Date.now())
    this.#newTaskId = options.newTaskId ?? (() => crypto.randomUUID())
  }

  get provider(): RuntimeProvider {
    return this.#provider
  }

  async submit(request: ExecutionRequest): Promise<ExecutionTask> {
    const base = normalize(request)
    const channel = selectChannel(base.files, this.#provider.capabilities)
    const taskId = this.#newTaskId()
    const spec: ExecutionSpec = { ...base, taskId, channel }
    const controller = new AbortController()
    const handle = await this.#provider.start(spec, controller.signal)
    const record: TaskRecord = { handle, controller, startedAt: this.#now() }
    this.#tasks.set(taskId, record)
    // 控制面硬超时：到点先记意图再 kill，终态以意图判定，不去问平台。
    const timer = setTimeout(() => {
      void this.#terminate(record, 'timeout')
    }, spec.timeoutMs)
    timer.unref?.()
    record.timer = timer
    return { taskId, status: 'queued' }
  }

  async get(taskId: string): Promise<ExecutionResult> {
    const record = this.#tasks.get(taskId)
    if (!record) throw new UnknownTaskError(taskId)
    if (record.result) return record.result
    const status = await this.#provider.poll(record.handle)
    if (status.state !== 'exited') {
      return {
        taskId,
        status: status.state,
        stdout: '',
        stderr: '',
        artifacts: [],
      }
    }
    const result: ExecutionResult = {
      taskId,
      status: this.#finalStatus(record, status.exitCode),
      stdout: truncateStream(status.stdout),
      stderr: truncateStream(status.stderr),
      exitCode: status.exitCode,
      artifacts: applyArtifactPolicy(status.artifacts, this.#provider.capabilities) as Artifact[],
      usage:
        status.memoryMb === undefined
          ? { durationMs: status.durationMs }
          : { durationMs: status.durationMs, memoryMb: status.memoryMb },
    }
    record.result = result
    this.#clearTimer(record)
    return result
  }

  async cancel(taskId: string): Promise<void> {
    const record = this.#tasks.get(taskId)
    if (!record) throw new UnknownTaskError(taskId)
    if (record.result) return
    await this.#terminate(record, 'cancel')
  }

  /** 先写意图再终止；意图只记第一次，后发的终止不改写终态。 */
  async #terminate(record: TaskRecord, intent: KillIntent): Promise<void> {
    if (record.result) return
    record.intent ??= intent
    this.#clearTimer(record)
    record.controller.abort()
    await this.#provider.kill(record.handle, record.intent)
  }

  #finalStatus(record: TaskRecord, exitCode: number): ExecutionStatus {
    if (record.intent) return record.intent === 'cancel' ? 'cancelled' : 'timed_out'
    if (exitCode === SOFT_TIMEOUT_EXIT_CODE) return 'timed_out'
    return exitCode === 0 ? 'succeeded' : 'failed'
  }

  #clearTimer(record: TaskRecord): void {
    if (record.timer === undefined) return
    clearTimeout(record.timer)
    record.timer = undefined
  }
}
