// 本文件实现本地 Python 子进程 Provider，供开发与单测使用。
//
// 隔离强度如实记账（design.md §5）：
//   - Linux：`unshare -rn`（user namespace 内建空 netns）实测可用时出站被阻断，
//     可信基是本进程而非平台；内核或 AppArmor 拒绝非特权 userns 时退化为不隔离。
//   - macOS / Windows：**没有等效隔离机制**，出站不受限。
// 因此本 Provider **仅供单测与开发**，禁止用于执行不可信代码。
//
// `limits.memoryMb` 在本 Provider **不强制**（contract.ts 已说明理由）：`spec.memoryMb`
// 被有意忽略，且 `ProviderStatus` 不回填 `memoryMb`——不报一个我们没度量的数。
import { type ChildProcessWithoutNullStreams, spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { type Artifact, SOFT_TIMEOUT_EXIT_CODE } from '../contract.js'

import type {
  ExecutionSpec,
  ProviderCapabilities,
  ProviderHandle,
  ProviderStatus,
  RuntimeProvider,
} from './runtime-provider.js'

const MIME_TYPES: Record<string, string> = {
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

const TEXT_MIME_PREFIXES = ['text/', 'application/json', 'image/svg+xml']

/** 单流采集上限：留出截断标记的余量，最终截断由 transport/channel 统一执行。 */
const STREAM_CAPTURE_LIMIT = 2 * 1024 * 1024

/** util-linux `unshare` 的绝对路径；只在 Linux 上读取。 */
const UNSHARE_PATH = '/usr/bin/unshare'

/** `unshare -rn` 能力探测超时：探测不应拖慢首次执行。 */
const UNSHARE_PROBE_TIMEOUT_MS = 5_000

export interface LocalProviderOptions {
  /** Python 可执行文件，默认 `python3`。 */
  readonly pythonPath?: string
  /** 关闭「无隔离」告警，仅供已知悉风险的单测使用。 */
  readonly suppressIsolationWarning?: boolean
}

interface LocalRun {
  readonly workDir: string
  readonly outputDir: string
  readonly startedAt: number
  child?: ChildProcessWithoutNullStreams
  spawned: boolean
  stdout: string
  stderr: string
  exited?: {
    exitCode: number
    stdout: string
    stderr: string
    artifacts: Artifact[]
    durationMs: number
  }
  done: Promise<void>
}

function mimeTypeFor(name: string): string {
  const dot = name.lastIndexOf('.')
  const extension = dot === -1 ? '' : name.slice(dot).toLowerCase()
  return MIME_TYPES[extension] ?? 'application/octet-stream'
}

/** 沙箱内软超时看门狗：到点以约定退出码 124 退出（design.md §3.1）。 */
function runnerSource(softTimeoutMs: number): string {
  return [
    'import os, sys, threading',
    'def _kq_soft_timeout():',
    '    sys.stderr.write("[sandbox] soft timeout reached\\n")',
    '    sys.stderr.flush()',
    `    os._exit(${SOFT_TIMEOUT_EXIT_CODE})`,
    `_kq_timer = threading.Timer(${(softTimeoutMs / 1000).toFixed(3)}, _kq_soft_timeout)`,
    '_kq_timer.daemon = True',
    '_kq_timer.start()',
    'import runpy',
    '_kq_main = os.path.join(os.environ["KQ_CODE_DIR"], "main.py")',
    'sys.argv = [_kq_main]',
    'runpy.run_path(_kq_main, run_name="__main__")',
    '',
  ].join('\n')
}

/** LocalProvider 一次执行的启动计划。 */
export interface LocalCommandPlan {
  readonly command: string
  readonly args: string[]
  /** true 表示已进入空 netns，出站被阻断。 */
  readonly isolated: boolean
}

export interface LocalCommandInputs {
  readonly platform: NodeJS.Platform
  readonly pythonPath: string
  readonly runnerPath: string
  /** Linux 上 `unshare` 的路径；不存在时为 null。 */
  readonly unsharePath: string | null
  /** `unshare -rn` 能力探测是否通过。 */
  readonly unshareUsable: boolean
}

/**
 * 决定 LocalProvider 如何启动一次执行。
 *
 * 只有 Linux 且 `unshare -rn` 实测可用时才隔离：单用 `-n` 建 netns 需要 CAP_SYS_ADMIN，
 * 非 root 必然 EPERM，因此不能用「文件存在」代替可用性（issue #193）。其余情况一律
 * 直接跑 Python，与 macOS/Windows 的「无隔离」语义一致，由调用方据此告警一次。
 */
export function resolveLocalCommand(inputs: LocalCommandInputs): LocalCommandPlan {
  const { platform, pythonPath, runnerPath, unsharePath, unshareUsable } = inputs
  if (platform === 'linux' && unsharePath !== null && unshareUsable) {
    return { command: unsharePath, args: ['-rn', '--', pythonPath, runnerPath], isolated: true }
  }
  return { command: pythonPath, args: [runnerPath], isolated: false }
}

/** Linux 上是否存在 `unshare`；非 Linux 恒为 null。 */
function localUnsharePath(): string | null {
  if (process.platform !== 'linux') return null
  return existsSync(UNSHARE_PATH) ? UNSHARE_PATH : null
}

/** `unshare -rn` 能力探测的进程级缓存。 */
let unshareUsable: boolean | undefined

/**
 * 探测 `unshare -rn` 是否真的可用。
 * 非 root 用户只有在 user namespace 可用时才能建 netns（AppArmor 等仍可能拒绝），
 * 因此必须实跑一次；结果进程级缓存，只探测一次。
 */
function canUseUnshareNetworkNamespace(): boolean {
  if (unshareUsable !== undefined) return unshareUsable
  unshareUsable = false
  const unsharePath = localUnsharePath()
  if (unsharePath !== null) {
    const probe = spawnSync(unsharePath, ['-rn', '--', 'true'], {
      stdio: 'ignore',
      timeout: UNSHARE_PROBE_TIMEOUT_MS,
    })
    unshareUsable = probe.status === 0
  }
  return unshareUsable
}

let warnedAboutIsolation = false

/**
 * 本地子进程运行时。
 * `enforcesNetworkPolicy` 为 false：出站阻断（若有）由本 runner 自建，非平台保证。
 */
export class LocalProvider implements RuntimeProvider {
  readonly id = 'local' as const
  readonly capabilities: ProviderCapabilities = {
    // 本地 exec 不走 fly 的 JSON 响应预算，但沿用同一组阈值，避免各 Provider 行为漂移。
    maxInlineInputBytes: 256 * 1024,
    maxInlineOutputBytes: 1024 * 1024,
    supportsMount: false,
    enforcesNetworkPolicy: false,
  }

  readonly #pythonPath: string
  readonly #suppressIsolationWarning: boolean
  readonly #runs = new Map<string, LocalRun>()

  constructor(options: LocalProviderOptions = {}) {
    this.#pythonPath = options.pythonPath ?? 'python3'
    this.#suppressIsolationWarning = options.suppressIsolationWarning ?? false
  }

  async start(spec: ExecutionSpec, signal: AbortSignal): Promise<ProviderHandle> {
    const workDir = await mkdtemp(join(tmpdir(), 'kq-code-interpreter-'))
    const codeDir = join(workDir, 'code')
    const inputDir = join(workDir, 'input')
    const outputDir = join(workDir, 'output')
    const mplConfigDir = join(workDir, 'mplconfig')
    // $OUTPUT_DIR 必须专属于本次任务，不跨任务复用（design.md §6.2）。
    await Promise.all([mkdir(codeDir), mkdir(inputDir), mkdir(outputDir), mkdir(mplConfigDir)])
    await writeFile(join(codeDir, 'main.py'), spec.code, 'utf8')
    await writeFile(join(codeDir, 'runner.py'), runnerSource(spec.softTimeoutMs), 'utf8')
    for (const file of spec.files) {
      await writeFile(
        join(inputDir, file.name),
        Buffer.from(file.content, file.encoding === 'base64' ? 'base64' : 'utf8'),
      )
    }

    const plan = resolveLocalCommand({
      platform: process.platform,
      pythonPath: this.#pythonPath,
      runnerPath: join(codeDir, 'runner.py'),
      unsharePath: localUnsharePath(),
      unshareUsable: canUseUnshareNetworkNamespace(),
    })
    this.#warnIfUnisolated(plan.isolated)

    const run: LocalRun = {
      workDir,
      outputDir,
      startedAt: Date.now(),
      spawned: false,
      stdout: '',
      stderr: '',
      done: Promise.resolve(),
    }
    run.done = this.#spawn(run, plan, codeDir, inputDir, mplConfigDir, signal)
    this.#runs.set(spec.taskId, run)
    return { taskId: spec.taskId, providerId: this.id, ref: run }
  }

  async poll(handle: ProviderHandle): Promise<ProviderStatus> {
    const run = this.#run(handle)
    if (run.exited) {
      return { state: 'exited', ...run.exited }
    }
    return run.spawned ? { state: 'running' } : { state: 'queued' }
  }

  async kill(handle: ProviderHandle, _reason: 'cancel' | 'timeout'): Promise<void> {
    const run = this.#run(handle)
    run.child?.kill('SIGKILL')
    await run.done
  }

  #run(handle: ProviderHandle): LocalRun {
    const run = this.#runs.get(handle.taskId)
    if (!run) throw new Error(`Unknown local run: ${handle.taskId}`)
    return run
  }

  /** 隔离不可用时告警一次；Linux 上 userns 被拒时同样要看见（issue #193）。 */
  #warnIfUnisolated(isolated: boolean): void {
    if (isolated || this.#suppressIsolationWarning || warnedAboutIsolation) return
    warnedAboutIsolation = true
    const reason =
      process.platform === 'linux' ? 'unshare -rn is not usable' : 'no isolation mechanism'
    // 隔离缺失必须让开发者看见，不能沉默。
    // biome-ignore lint/suspicious/noConsole: 隔离缺失属于必须暴露给开发者的告警
    console.warn(
      '[code_interpreter] LocalProvider is running without network isolation ' +
        `(platform: ${process.platform}; ${reason}). It is intended for unit tests ` +
        'and development only; never use it to execute untrusted code.',
    )
  }

  async #spawn(
    run: LocalRun,
    plan: LocalCommandPlan,
    codeDir: string,
    inputDir: string,
    mplConfigDir: string,
    signal: AbortSignal,
  ): Promise<void> {
    const env = {
      PATH: process.env['PATH'] ?? '/usr/bin:/bin',
      HOME: run.workDir,
      LANG: 'C.UTF-8',
      KQ_CODE_DIR: codeDir,
      INPUT_DIR: inputDir,
      OUTPUT_DIR: run.outputDir,
      // 降权后 matplotlib 会因 $HOME/.config 不可写而退回临时目录并拖慢导入（实测）。
      MPLCONFIGDIR: mplConfigDir,
      PYTHONDONTWRITEBYTECODE: '1',
    }
    const child = spawn(plan.command, plan.args, { cwd: inputDir, env, stdio: 'pipe' })
    run.child = child
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      if (run.stdout.length < STREAM_CAPTURE_LIMIT) run.stdout += chunk
    })
    child.stderr.on('data', (chunk: string) => {
      if (run.stderr.length < STREAM_CAPTURE_LIMIT) run.stderr += chunk
    })
    child.on('spawn', () => {
      run.spawned = true
    })
    const onAbort = (): void => {
      child.kill('SIGKILL')
    }
    signal.addEventListener('abort', onAbort, { once: true })

    const exitCode = await new Promise<number>((resolve) => {
      child.once('error', (error) => {
        run.stderr += `[sandbox] failed to start python: ${error.message}\n`
        resolve(127)
      })
      child.once('close', (code, sig) => {
        // 被信号终止时没有退出码；由 Service 依据自身意图判定终态。
        resolve(code ?? (sig ? 137 : 1))
      })
    })
    signal.removeEventListener('abort', onAbort)

    // Provider 只有在工作目录已清理后才能暴露终态；否则 poll 可能让上层先返回结果，
    // 导致调用方观察到本应 ephemeral 的目录短暂泄漏。
    let artifacts: Artifact[] = []
    try {
      artifacts = await this.#collectArtifacts(run.outputDir)
    } finally {
      await rm(run.workDir, { recursive: true, force: true })
    }
    run.exited = {
      exitCode,
      stdout: run.stdout,
      stderr: run.stderr,
      artifacts,
      durationMs: Date.now() - run.startedAt,
    }
  }

  /** 只捕获 $OUTPUT_DIR 的顶层文件：子目录与临时文件不进产物（design.md §6.2）。 */
  async #collectArtifacts(outputDir: string): Promise<Artifact[]> {
    let names: string[]
    try {
      names = await readdir(outputDir)
    } catch {
      return []
    }
    const artifacts: Artifact[] = []
    for (const name of names.sort()) {
      const path = join(outputDir, name)
      const info = await stat(path).catch(() => undefined)
      if (!info?.isFile()) continue
      const mimeType = mimeTypeFor(name)
      const isText = TEXT_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix))
      const bytes = await readFile(path)
      artifacts.push({
        name,
        mimeType,
        sizeBytes: info.size,
        encoding: isText ? 'utf8' : 'base64',
        content: bytes.toString(isText ? 'utf8' : 'base64'),
      })
    }
    return artifacts
  }
}
