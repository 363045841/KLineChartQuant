/**
 * 主进程托管的本地行情后端。
 *
 * 打包后的应用不能要求用户自己装 Go 再敲 `pnpm connector`，所以两个纯 Go connector
 * （gotdx、binance）随安装包分发到 `resources/backends/<platform>-<arch>/`，由主进程在
 * 建窗口前拉起、退出时回收。Python 后端（baostock / mt5 / ths）不在此列：它们依赖解释器、
 * 本机终端或 API Key，继续以外部服务方式由用户提供。
 *
 * 这里只判断「进程是否在服务」，不判断「能否拿到上游行情」：gotdx 的 `/health/ready` 会在
 * 通达信服务器不可达时返回 503，用它当启动条件会让无外网的环境白等超时。上游状态由数据源
 * 面板自己的 probe 展示。
 *
 * 端口沿用 connector 的出厂默认值，并与 core `dataSourceRegistry` 的默认 baseUrl 保持一致；
 * 反过来 import core 会把整套行情运行时打进主进程 bundle，所以这里显式保留同一组数字。
 */
import { spawn } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, type WriteStream } from 'node:fs'
import { join } from 'node:path'

/** 随安装包分发的后端声明。 */
interface ManagedBackendSpec {
  /** 数据源 id，用于日志与状态；同时决定 userData 下的数据目录名。 */
  readonly id: string
  /** 可执行文件名（Windows 运行时补 `.exe`）。 */
  readonly binaryName: string
  /** connector 出厂端口，必须与 core 默认 baseUrl 的端口一致。 */
  readonly port: number
  /** 进程存活探测路径：命中 2xx 说明服务已监听，与上游行情是否可用无关。 */
  readonly healthPath: string
  /** userData 下属于该后端的数据目录名。 */
  readonly dataDirectory: string
  /** connector 默认把数据写在 cwd 下，安装目录不可写，必须显式改到 userData。 */
  readonly env: (dataDirectory: string) => Record<string, string>
}

/** 托管清单；顺序即启动顺序。 */
export const MANAGED_BACKENDS: readonly ManagedBackendSpec[] = [
  {
    id: 'gotdx',
    binaryName: 'gotdx',
    port: 8080,
    healthPath: '/health/live',
    dataDirectory: 'gotdx',
    env: (directory) => ({ SYMBOL_DB_PATH: join(directory, 'data', 'tdx-symbols.db') }),
  },
  {
    id: 'binance',
    binaryName: 'binance',
    port: 8091,
    healthPath: '/health',
    dataDirectory: 'binance',
    env: (directory) => ({ BINANCE_CACHE_DIR: join(directory, 'archives') }),
  },
]

/** 单个后端的最终状态；失败只影响该数据源，不阻止应用启动。 */
export type BackendState = 'running' | 'reused' | 'missing' | 'failed'

export interface BackendStatus {
  readonly id: string
  readonly state: BackendState
  /** 排障细节：可执行文件路径、退出码或超时原因。 */
  readonly detail?: string
}

/** 后端进程中本模块用到的部分，便于单测注入替身。 */
export interface ManagedProcess {
  readonly stdout: NodeJS.ReadableStream | null
  readonly stderr: NodeJS.ReadableStream | null
  on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this
  kill(signal?: NodeJS.Signals | number): boolean
}

export interface SpawnBackendOptions {
  readonly cwd: string
  readonly env: NodeJS.ProcessEnv
  readonly stdio: 'pipe'
  readonly windowsHide: boolean
}

export type SpawnBackend = (
  command: string,
  args: readonly string[],
  options: SpawnBackendOptions,
) => ManagedProcess

export interface ManagedBackendHostOptions {
  /** Electron 的 `process.resourcesPath`。 */
  readonly resourceRoot: string
  /** `app.getPath('userData')`：后端数据与日志都落在这里，不写安装目录。 */
  readonly dataRoot: string
  /** 单后端就绪超时，超时后进程保留（首次启动可能要下载目录），只标记失败。 */
  readonly readyTimeoutMs?: number
  readonly pollIntervalMs?: number
  readonly platform?: NodeJS.Platform
  readonly arch?: string
  readonly spawnBackend?: SpawnBackend
  readonly probe?: (url: string) => Promise<boolean>
}

export interface ManagedBackendHost {
  /** 全部后端 settle 后 resolve；单个后端失败不会 reject。 */
  readonly ready: Promise<void>
  statuses(): readonly BackendStatus[]
  /** 终止由本进程启动的后端；复用的外部服务不受影响。 */
  dispose(): Promise<void>
}

const DEFAULT_READY_TIMEOUT_MS = 10_000
const DEFAULT_POLL_INTERVAL_MS = 250
const PROBE_TIMEOUT_MS = 1_000
const TERMINATE_TIMEOUT_MS = 3_000

/** 健康检查只用于就绪判定，请求失败等价于「还没起来」。 */
async function probeHealth(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
    return response.ok
  } catch {
    return false
  }
}

/** 轮询间隔；只在这里等待，避免调用方自己拼定时器。 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Windows 下可执行文件带扩展名。 */
function executableName(spec: ManagedBackendSpec, platform: NodeJS.Platform): string {
  return platform === 'win32' ? `${spec.binaryName}.exe` : spec.binaryName
}

/** 就绪地址：connector 只监听 127.0.0.1，不暴露到局域网。 */
function healthUrl(spec: ManagedBackendSpec): string {
  return `http://127.0.0.1:${spec.port}${spec.healthPath}`
}

const defaultSpawnBackend: SpawnBackend = (command, args, options) =>
  spawn(command, [...args], options)

/**
 * 启动全部托管后端。
 *
 * 端口上已有同款服务（开发者用 `pnpm connector` 起的）时直接复用，既不重复拉起，也不在
 * 退出时代替别人回收进程。
 */
export function startManagedBackends(options: ManagedBackendHostOptions): ManagedBackendHost {
  const spawnBackend = options.spawnBackend ?? defaultSpawnBackend
  const probe = options.probe ?? probeHealth
  const platform = options.platform ?? process.platform
  const arch = options.arch ?? process.arch
  const readyTimeoutMs = options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
  const statuses = new Map<string, BackendStatus>()
  const children = new Map<string, { child: ManagedProcess; exited: boolean }>()
  let logStream: WriteStream | null = null
  let disposed = false

  /** 后端输出落到 userData：打包后没有终端可看，出问题只能靠这份日志。 */
  function log(backendId: string, chunk: Buffer | string): void {
    if (!logStream) {
      mkdirSync(join(options.dataRoot, 'logs'), { recursive: true })
      logStream = createWriteStream(join(options.dataRoot, 'logs', 'backends.log'), { flags: 'a' })
    }
    logStream.write(`[${backendId}] ${chunk.toString()}`)
  }

  /** 等待后端开始服务；进程提前退出或宿主已释放则立刻收敛，不必耗满超时。 */
  async function waitUntilReady(
    spec: ManagedBackendSpec,
    hasExited: () => boolean,
  ): Promise<BackendStatus> {
    const url = healthUrl(spec)
    const deadline = Date.now() + readyTimeoutMs
    while (Date.now() < deadline) {
      if (await probe(url)) return { id: spec.id, state: 'running' }
      if (disposed) return { id: spec.id, state: 'failed', detail: 'disposed while starting' }
      if (hasExited())
        return { id: spec.id, state: 'failed', detail: 'the process exited before serving' }
      await delay(pollIntervalMs)
    }
    // 端口没起来但进程还在（首次启动可能在下载品种目录），保留进程，仅标记失败。
    return { id: spec.id, state: 'failed', detail: 'timed out waiting for the port to serve' }
  }

  async function ensure(spec: ManagedBackendSpec): Promise<BackendStatus> {
    if (await probe(healthUrl(spec))) return { id: spec.id, state: 'reused' }

    const executable = join(
      options.resourceRoot,
      'backends',
      `${platform}-${arch}`,
      executableName(spec, platform),
    )
    if (!existsSync(executable)) return { id: spec.id, state: 'missing', detail: executable }

    const dataDirectory = join(options.dataRoot, spec.dataDirectory)
    mkdirSync(dataDirectory, { recursive: true })
    const child = spawnBackend(executable, [], {
      cwd: dataDirectory,
      env: { ...process.env, ...spec.env(dataDirectory) },
      stdio: 'pipe',
      windowsHide: true,
    })
    const entry = { child, exited: false }
    child.stdout?.on('data', (chunk: Buffer) => log(spec.id, chunk))
    child.stderr?.on('data', (chunk: Buffer) => log(spec.id, chunk))
    child.on('exit', () => {
      entry.exited = true
      children.delete(spec.id)
    })
    children.set(spec.id, entry)
    return waitUntilReady(spec, () => entry.exited)
  }

  async function terminate(entry: { child: ManagedProcess; exited: boolean }): Promise<void> {
    if (entry.exited) return
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, TERMINATE_TIMEOUT_MS)
      entry.child.on('exit', () => {
        clearTimeout(timer)
        resolve()
      })
      entry.child.kill()
    })
  }

  const ready = Promise.all(
    MANAGED_BACKENDS.map((spec) =>
      ensure(spec)
        // 启动失败（例如产物损坏）只影响该数据源，应用照常打开。
        .catch((error: unknown) => ({
          id: spec.id,
          state: 'failed' as const,
          detail: error instanceof Error ? error.message : String(error),
        }))
        .then((status) => {
          statuses.set(status.id, status)
        }),
    ),
  ).then(() => undefined)

  return {
    ready,
    // 按清单顺序返回，避免并发完成顺序让日志与排障信息每次不同。
    statuses: () =>
      MANAGED_BACKENDS.flatMap((spec) => {
        const status = statuses.get(spec.id)
        return status ? [status] : []
      }),
    async dispose() {
      disposed = true
      await Promise.all([...children.values()].map(terminate))
      children.clear()
      logStream?.end()
      logStream = null
      await ready
    },
  }
}
