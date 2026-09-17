// 本文件定义 Provider 无关的代码解释器契约。
// ExecutionRequest / ExecutionResult 逐字取自 issue #155，字段不增不删。

/** 输入文件；首版只承载 CSV/XLSX。 */
export interface InputFile {
  readonly name: string
  /** `utf8` 时为原文，`base64` 时为二进制编码；默认 `utf8`。 */
  readonly content: string
  readonly encoding?: 'utf8' | 'base64'
}

/** 沙箱产物；只捕获 `$OUTPUT_DIR` 顶层文件。 */
export interface Artifact {
  readonly name: string
  readonly mimeType: string
  readonly sizeBytes: number
  readonly encoding?: 'utf8' | 'base64'
  /** 走 inline 通道时的内容；超出 inline 上限且无挂载通道时为空。 */
  readonly content?: string
  /** 内容缺失的原因；存在即表示该产物未随结果回传，绝不静默截断。 */
  readonly omittedReason?: string
}

export interface ExecutionRequest {
  language: 'python'
  code: string
  files?: InputFile[]
  limits?: {
    timeoutMs?: number // 默认 60000，上限 60000
    /**
     * 默认 1024。**这是请求值，不是各 Provider 都强制执行的上限。**
     * - `fly-machines`：下发到 Machine 的 guest 规格，由 fly 平台强制。
     * - `cloud-run-sandbox`：官方文档中未找到内存相关 flag，**不下发**，实际由 Cloud Run
     *   宿主实例的规格间接约束。
     * - `local`：**完全不强制**。未用 `resource.setrlimit(RLIMIT_AS)` 自限，因为
     *   RLIMIT_AS 限制的是虚拟地址空间，而 numpy/pandas 会预留远大于实际驻留集的地址空间，
     *   按 `memoryMb` 设限会在正常负载下误杀；macOS 上该限制也不可靠。LocalProvider 仅供
     *   单测与开发，不承担对抗性负载，故以「明示不强制」代替「装作强制」。
     */
    memoryMb?: number
  }
  policy?: {
    network: 'disabled'
    packages: 'base'
  }
}

export type ExecutionStatus =
  'queued' | 'running' | 'succeeded' | 'failed' | 'timed_out' | 'cancelled'

/** submit 的返回值：任务已受理，终态需由 get 轮询。 */
export interface ExecutionTask {
  taskId: string
  status: ExecutionStatus
}

export interface ExecutionResult {
  taskId: string
  status: ExecutionStatus
  stdout: string
  stderr: string
  exitCode?: number
  artifacts: Artifact[]
  usage?: { durationMs: number; memoryMb?: number }
}

export interface CodeInterpreter {
  submit(request: ExecutionRequest): Promise<ExecutionTask>
  get(taskId: string): Promise<ExecutionResult>
  cancel(taskId: string): Promise<void>
}

/** 默认与上限，取自 issue #155。 */
export const DEFAULT_TIMEOUT_MS = 60_000
export const MAX_TIMEOUT_MS = 60_000
export const DEFAULT_MEMORY_MB = 1024

/**
 * 沙箱内软超时的约定退出码，沿用 GNU `timeout` 惯例。
 * 平台无法给出 `timed_out` 终态，超时语义由控制面定义（design.md §3.1）。
 */
export const SOFT_TIMEOUT_EXIT_CODE = 124

/** 未知 taskId。 */
export class UnknownTaskError extends Error {
  constructor(taskId: string) {
    super(`Unknown code interpreter task: ${taskId}`)
    this.name = 'UnknownTaskError'
  }
}

/** 请求本身不可执行（策略不符、输入超出可用通道等）。 */
export class ExecutionRejectedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExecutionRejectedError'
  }
}
