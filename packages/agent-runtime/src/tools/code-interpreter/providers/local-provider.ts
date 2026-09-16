// 本文件实现本地 Python 子进程 Provider，供开发与单测使用。
//
// 隔离强度如实记账（design.md §5）：
//   - Linux：`unshare -n` 空 netns，出站被阻断，可信基是本进程而非平台。
//   - macOS / Windows：**没有等效隔离机制**，出站不受限。
// 因此本 Provider **仅供单测与开发**，禁止用于执行不可信代码。
//
// `limits.memoryMb` 在本 Provider **不强制**（contract.ts 已说明理由）：`spec.memoryMb`
// 被有意忽略，且 `ProviderStatus` 不回填 `memoryMb`——不报一个我们没度量的数。
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { SOFT_TIMEOUT_EXIT_CODE, type Artifact } from '../contract.js'

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

export interface LocalProviderOptions {
  /** Python 可执行文件，默认 `python3`。 */
  readonly pythonPath?: string
  /** 关闭 macOS/Windows 上的「无隔离」告警，仅供已知悉风险的单测使用。 */
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
    this.#warnIfUnisolated()
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

    const run: LocalRun = {
      workDir,
      outputDir,
      startedAt: Date.now(),
      spawned: false,
      stdout: '',
      stderr: '',
      done: Promise.resolve(),
    }
    run.done = this.#spawn(run, spec, codeDir, inputDir, mplConfigDir, signal)
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

  #warnIfUnisolated(): void {
    if (this.#suppressIsolationWarning || warnedAboutIsolation) return
    if (process.platform === 'linux' && existsSync('/usr/bin/unshare')) return
    warnedAboutIsolation = true
    // 隔离缺失必须让开发者看见，不能沉默。
    // eslint-disable-next-line no-console
    console.warn(
      '[code_interpreter] LocalProvider has no network isolation on this platform ' +
        `(${process.platform}). It is intended for unit tests and development only; ` +
        'never use it to execute untrusted code.',
    )
  }

  async #spawn(
    run: LocalRun,
    spec: ExecutionSpec,
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
    const runner = join(codeDir, 'runner.py')
    const useUnshare = process.platform === 'linux' && existsSync('/usr/bin/unshare')
    const command = useUnshare ? '/usr/bin/unshare' : this.#pythonPath
    const args = useUnshare ? ['-n', '--', this.#pythonPath, runner] : [runner]

    const child = spawn(command, args, { cwd: inputDir, env, stdio: 'pipe' })
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

    const artifacts = await this.#collectArtifacts(run.outputDir)
    run.exited = {
      exitCode,
      stdout: run.stdout,
      stderr: run.stderr,
      artifacts,
      durationMs: Date.now() - run.startedAt,
    }
    await rm(run.workDir, { recursive: true, force: true })
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
