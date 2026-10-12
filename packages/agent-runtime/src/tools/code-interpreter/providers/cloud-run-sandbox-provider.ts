// 本文件实现 Google Cloud Run **sandboxes**（Preview）Provider。
//
// ⚠️ **未实测（NOT VERIFIED AGAINST A LIVE ENVIRONMENT）** ⚠️
//   本仓库没有 GCP 环境，本 Provider 的每一行都只依据官方文档写成，**从未对真实
//   Cloud Run sandboxes 跑过一次**。下文所有「官方文档」注释都标注了出处 URL（PRD AC5）；
//   凡官方文档没有写的东西，一律标注「未在官方文档中找到」并做防御性处理，
//   **不猜字段名、不编造 CLI 输出格式**（issue #155 要求 5）。
//
// 形态（design.md §7）：Cloud Run sandboxes **没有 REST API**，唯一接口是宿主容器内的
//   CLI `/usr/local/gcp/bin/sandbox`（https://docs.cloud.google.com/run/docs/code-execution）。
//   因此本 Provider **运行在 launcher 宿主进程内**（一个 `sandboxLauncher: true` 的常驻
//   Cloud Run Service/Job 容器）：taskId 分配、状态机、取消全部住在本进程，
//   每个任务在宿主里 `sandbox do` 起一个一次性沙箱。
//
// 隔离强度（design.md §5）：这是三个 Provider 中唯一 `enforcesNetworkPolicy: true` 的，
//   依据是官方文档两句原文：
//     - "By default, all outbound traffic from the sandbox is blocked."
//     - "By default, sandboxes don't have access to the parent workload, environment
//        variables, secrets, or the Google Cloud metadata server."
//   （https://docs.cloud.google.com/run/docs/code-execution）
//   即：出站阻断由 **Google 平台** 保证，不是我们自建的 runner。本 Provider 因此
//   **绝不传 `--allow-egress`**。
import { spawn } from 'node:child_process'
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

/**
 * 沙箱 CLI 的绝对路径。
 * 官方文档：https://docs.cloud.google.com/run/docs/code-execution
 * 原文将该工具描述为宿主容器内的命令行工具 `/usr/local/gcp/bin/sandbox`。
 */
export const CLOUD_RUN_SANDBOX_CLI_PATH = '/usr/local/gcp/bin/sandbox'

/** 沙箱内的挂载点。宿主侧目录由本 Provider 创建，沙箱侧路径是我们自己的约定。 */
const SANDBOX_CODE_DIR = '/mnt/code'
const SANDBOX_INPUT_DIR = '/mnt/in'
const SANDBOX_OUTPUT_DIR = '/mnt/out'

/**
 * 沙箱内解释器路径。
 * 官方文档示例里用的是绝对路径形式的命令（`sandbox do -- <command>`），
 * 但**沙箱镜像里 Python 的具体路径未在官方文档中找到** —— 它取决于宿主镜像
 * （`python-data-analysis-v1`），由我们自己构建，故此处可配置，默认 `/usr/bin/python3`。
 */
const DEFAULT_PYTHON_PATH = '/usr/bin/python3'

/**
 * 退出码哨兵行。
 *
 * **`sandbox do` 是否把被执行命令的退出码原样作为 CLI 自身退出码，未在官方文档中找到。**
 * 文档只说明 `do` 等价于 `run` → `exec` → `delete` 三步，没有规定退出码传播语义，
 * 也没有规定任何机器可读的输出格式（CLI 输出格式**无稳定性承诺**）。
 * 因此不依赖 CLI 退出码：由沙箱内的 runner 在 stdout 末尾打一行哨兵
 * `__KQ_EXIT__<code>`，解析层优先采信它；拿不到时才退回 CLI 退出码，并标记来源。
 */
const EXIT_SENTINEL_PREFIX = '__KQ_EXIT__'

/** 单流采集上限；最终 1 MiB 截断由 transport/channel 统一执行。 */
const STREAM_CAPTURE_LIMIT = 2 * 1024 * 1024

/** CLI 进程本身的超时余量（毫秒）：沙箱内软超时之后，留给收尾与 `delete` 的时间。 */
const CLI_TIMEOUT_MARGIN_MS = 10_000

const MIME_TYPES: Record<string, string> = {
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

const TEXT_MIME_PREFIXES = ['text/', 'application/json', 'image/svg+xml']

function mimeTypeFor(name: string): string {
  const dot = name.lastIndexOf('.')
  const extension = dot === -1 ? '' : name.slice(dot).toLowerCase()
  return MIME_TYPES[extension] ?? 'application/octet-stream'
}

/** CLI 一次调用的原始结果；`exitCode` 为 undefined 表示进程被信号终止或未能启动。 */
export interface SandboxCommandOutput {
  readonly exitCode: number | undefined
  readonly stdout: string
  readonly stderr: string
  /** 进程未能启动时的原因；存在即表示 stdout/stderr 不可采信。 */
  readonly spawnError?: string
}

export interface SandboxCommandOptions {
  readonly signal: AbortSignal
  readonly timeoutMs: number
}

/**
 * CLI 执行器。抽成接口有两个目的：
 *   1. 本 Provider 无法在本仓库真跑，测试只能注入 fake（协议编排测试，非端到端验证）；
 *   2. 宿主形态若从「本进程 spawn」换成「HTTP 控制面转发」，只需换这一层。
 */
export interface SandboxCommandRunner {
  run(argv: readonly string[], options: SandboxCommandOptions): Promise<SandboxCommandOutput>
}

/** 默认执行器：在 launcher 宿主容器内直接 spawn CLI。 */
export function createChildProcessSandboxRunner(): SandboxCommandRunner {
  return {
    async run(argv, options) {
      const [command, ...args] = argv
      if (command === undefined) throw new Error('Empty sandbox command')
      return await new Promise<SandboxCommandOutput>((resolve) => {
        const child = spawn(command, args, { stdio: 'pipe' })
        let stdout = ''
        let stderr = ''
        child.stdout.setEncoding('utf8')
        child.stderr.setEncoding('utf8')
        child.stdout.on('data', (chunk: string) => {
          if (stdout.length < STREAM_CAPTURE_LIMIT) stdout += chunk
        })
        child.stderr.on('data', (chunk: string) => {
          if (stderr.length < STREAM_CAPTURE_LIMIT) stderr += chunk
        })
        const timer = setTimeout(() => {
          child.kill('SIGKILL')
        }, options.timeoutMs)
        timer.unref?.()
        const onAbort = (): void => {
          child.kill('SIGKILL')
        }
        options.signal.addEventListener('abort', onAbort, { once: true })
        child.once('error', (error) => {
          clearTimeout(timer)
          options.signal.removeEventListener('abort', onAbort)
          resolve({ exitCode: undefined, stdout, stderr, spawnError: error.message })
        })
        child.once('close', (code) => {
          clearTimeout(timer)
          options.signal.removeEventListener('abort', onAbort)
          resolve({ exitCode: code ?? undefined, stdout, stderr })
        })
      })
    },
  }
}

/** 解析结果；`exitCodeSource` 如实记录退出码的来源，不掩盖不确定性。 */
export interface ParsedSandboxResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
  readonly exitCodeSource: 'sentinel' | 'cli' | 'unknown'
}

/**
 * **CLI 输出解析层——全 Provider 唯一一处。**
 *
 * 官方文档没有给 `sandbox do` 任何输出格式承诺（无 `--format=json` 之类的说明，
 * 未在官方文档中找到），因此这里只做两件不依赖格式的事：
 *   1. 从 stdout 中摘出我们自己注入的哨兵行 `__KQ_EXIT__<code>` 并移除它；
 *   2. 哨兵缺失时退回 CLI 退出码，并把来源标成 `cli`/`unknown` 交给上层如实呈现。
 *
 * 畸形输出（哨兵缺失、数字非法、stdout 为空、CLI 打了额外前后缀）在此全部容错，
 * 绝不抛异常——解析层崩掉会让一次本可返回 stderr 的失败变成不可诊断的异常。
 */
export function parseSandboxDoOutput(output: SandboxCommandOutput): ParsedSandboxResult {
  const lines = output.stdout.split('\n')
  let sentinelIndex = -1
  let sentinelCode: number | undefined
  // 从后往前找：用户代码理论上也能打出同样的字符串，最后一行才是我们 runner 打的。
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = (lines[index] ?? '').trim()
    if (!line.startsWith(EXIT_SENTINEL_PREFIX)) continue
    const parsed = Number.parseInt(line.slice(EXIT_SENTINEL_PREFIX.length), 10)
    if (!Number.isInteger(parsed)) break
    sentinelIndex = index
    sentinelCode = parsed
    break
  }

  if (sentinelIndex >= 0 && sentinelCode !== undefined) {
    lines.splice(sentinelIndex, 1)
    return {
      exitCode: sentinelCode,
      stdout: lines.join('\n'),
      stderr: output.stderr,
      exitCodeSource: 'sentinel',
    }
  }

  if (output.spawnError !== undefined) {
    return {
      exitCode: 127,
      stdout: output.stdout,
      stderr: `${output.stderr}[sandbox] failed to launch ${CLOUD_RUN_SANDBOX_CLI_PATH}: ${output.spawnError}\n`,
      exitCodeSource: 'unknown',
    }
  }

  if (output.exitCode === undefined) {
    // 被信号终止或 CLI 未给退出码。终态交给 Service 的意图判定，这里只给占位码。
    return {
      exitCode: 137,
      stdout: output.stdout,
      stderr: output.stderr,
      exitCodeSource: 'unknown',
    }
  }

  return {
    exitCode: output.exitCode,
    stdout: output.stdout,
    stderr: output.stderr,
    exitCodeSource: 'cli',
  }
}

/**
 * 沙箱内的 Python 宿主：软超时看门狗（约定退出码 124）+ 退出码哨兵行。
 * 哨兵必须在**所有**路径上打出，否则解析层只能退回不可靠的 CLI 退出码。
 */
function runnerSource(softTimeoutMs: number): string {
  return [
    'import os, sys, threading, runpy',
    'def _kq_emit(code):',
    `    sys.stdout.write("\\n${EXIT_SENTINEL_PREFIX}%d\\n" % code)`,
    '    sys.stdout.flush()',
    'def _kq_soft_timeout():',
    '    sys.stderr.write("[sandbox] soft timeout reached\\n")',
    '    sys.stderr.flush()',
    `    _kq_emit(${SOFT_TIMEOUT_EXIT_CODE})`,
    `    os._exit(${SOFT_TIMEOUT_EXIT_CODE})`,
    `_kq_timer = threading.Timer(${(softTimeoutMs / 1000).toFixed(3)}, _kq_soft_timeout)`,
    '_kq_timer.daemon = True',
    '_kq_timer.start()',
    `_kq_main = os.path.join("${SANDBOX_CODE_DIR}", "main.py")`,
    'sys.argv = [_kq_main]',
    '_kq_code = 0',
    'try:',
    '    runpy.run_path(_kq_main, run_name="__main__")',
    'except SystemExit as exc:',
    '    _kq_code = exc.code if isinstance(exc.code, int) else (0 if exc.code is None else 1)',
    'except BaseException:',
    '    import traceback',
    '    traceback.print_exc()',
    '    _kq_code = 1',
    '_kq_emit(_kq_code)',
    'sys.stdout.flush()',
    'sys.stderr.flush()',
    'os._exit(_kq_code)',
    '',
  ].join('\n')
}

export interface CloudRunSandboxProviderOptions {
  /** CLI 路径，默认 `/usr/local/gcp/bin/sandbox`。 */
  readonly cliPath?: string
  /** 沙箱内的 Python 解释器路径，默认 `/usr/bin/python3`。 */
  readonly pythonPath?: string
  /** 宿主侧工作目录根，默认系统临时目录。 */
  readonly workRoot?: string
  /** 仅供测试注入的 CLI 执行器（本 Provider 无法在本仓库真跑）。 */
  readonly commandRunner?: SandboxCommandRunner
  readonly now?: () => number
}

interface SandboxRun {
  readonly workDir: string
  readonly outputDir: string
  readonly startedAt: number
  readonly controller: AbortController
  running: boolean
  killed: boolean
  exited?: {
    exitCode: number
    stdout: string
    stderr: string
    artifacts: Artifact[]
    durationMs: number
  }
  done: Promise<void>
}

/**
 * 缺少宿主环境即返回 undefined —— 未配置时 Provider 不注册，但**绝不让 Agent 启动失败**
 * （implement.md 回滚点 R5）。
 *
 * 判定条件刻意保守：必须显式开启开关**且** CLI 文件真实存在。
 * 本 Provider 只有跑在 `sandboxLauncher: true` 的 Cloud Run 容器内才有意义
 * （https://docs.cloud.google.com/run/docs/configuring/jobs/sandboxes），
 * 在开发机上误启用只会得到一堆 ENOENT。
 */
export function createCloudRunSandboxProviderFromEnv(
  env: Record<string, string | undefined> = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env ?? {},
  fileExists: (path: string) => boolean = existsSync,
): CloudRunSandboxProvider | undefined {
  const enabled = env['KQ_CODE_INTERPRETER_CLOUD_RUN_SANDBOX']
  if (enabled !== '1' && enabled !== 'true') return undefined
  const cliPath = env['KQ_CODE_INTERPRETER_SANDBOX_CLI'] ?? CLOUD_RUN_SANDBOX_CLI_PATH
  if (!fileExists(cliPath)) return undefined
  const pythonPath = env['KQ_CODE_INTERPRETER_SANDBOX_PYTHON']
  return new CloudRunSandboxProvider({
    cliPath,
    ...(pythonPath ? { pythonPath } : {}),
  })
}

/**
 * Cloud Run sandboxes 运行时。**未实测**（见文件头）。
 *
 * 一次执行 = 一次 `sandbox do`。官方文档说明 `do` 等价于
 * `run` → `exec` → `delete`，天然一次性，无需我们自己删沙箱
 * （https://docs.cloud.google.com/run/docs/code-execution）。
 */
export class CloudRunSandboxProvider implements RuntimeProvider {
  readonly id = 'cloud-run-sandbox' as const

  /**
   * ⚠️ **阈值是未经验证的保守假设，不是实测值。**
   * Cloud Run sandboxes 的单沙箱资源配额、并发上限、bind mount 大小限制
   * **均未在官方文档中找到**（research/cloud-run-sandbox.md §8 第 10 项）。
   * 这里沿用 fly 侧实测得出的同一组数字，**纯粹是为了各 Provider 行为不漂移**，
   * 不代表 Cloud Run 上测过。取得到真实数字之前不要上调。
   */
  readonly capabilities: ProviderCapabilities = {
    maxInlineInputBytes: 256 * 1024,
    maxInlineOutputBytes: 1024 * 1024,
    // CLI 支持 `--mount type=bind,...`，但本 Provider 未实现「超阈值改走挂载」的通道
    // 语义（大文件的宿主侧落盘与回传未做）。以拒绝求正确，不给会静默截断的通道。
    supportsMount: false,
    // 唯一为 true 的 Provider：出站阻断与 metadata server 屏蔽均为官方默认行为
    // （https://docs.cloud.google.com/run/docs/code-execution）。
    enforcesNetworkPolicy: true,
  }

  readonly #cliPath: string
  readonly #pythonPath: string
  readonly #workRoot: string
  readonly #runner: SandboxCommandRunner
  readonly #now: () => number
  readonly #runs = new Map<string, SandboxRun>()

  constructor(options: CloudRunSandboxProviderOptions = {}) {
    this.#cliPath = options.cliPath ?? CLOUD_RUN_SANDBOX_CLI_PATH
    this.#pythonPath = options.pythonPath ?? DEFAULT_PYTHON_PATH
    this.#workRoot = options.workRoot ?? tmpdir()
    this.#runner = options.commandRunner ?? createChildProcessSandboxRunner()
    this.#now = options.now ?? (() => Date.now())
  }

  async start(spec: ExecutionSpec, signal: AbortSignal): Promise<ProviderHandle> {
    const workDir = await mkdtemp(join(this.#workRoot, 'kq-crsb-'))
    const codeDir = join(workDir, 'code')
    const inputDir = join(workDir, 'input')
    const outputDir = join(workDir, 'output')
    // $OUTPUT_DIR 必须专属于本次任务，不跨任务复用（design.md §6.2）。
    await Promise.all([mkdir(codeDir), mkdir(inputDir), mkdir(outputDir)])
    await writeFile(join(codeDir, 'main.py'), spec.code, 'utf8')
    await writeFile(join(codeDir, 'runner.py'), runnerSource(spec.softTimeoutMs), 'utf8')
    for (const file of spec.files) {
      await writeFile(
        join(inputDir, file.name),
        Buffer.from(file.content, file.encoding === 'base64' ? 'base64' : 'utf8'),
      )
    }

    const controller = new AbortController()
    const run: SandboxRun = {
      workDir,
      outputDir,
      startedAt: this.#now(),
      controller,
      running: false,
      killed: false,
      done: Promise.resolve(),
    }
    const onAbort = (): void => {
      run.killed = true
      controller.abort()
    }
    signal.addEventListener('abort', onAbort, { once: true })
    run.done = this.#execute(run, spec, codeDir, inputDir, outputDir).finally(() => {
      signal.removeEventListener('abort', onAbort)
    })
    this.#runs.set(spec.taskId, run)
    return { taskId: spec.taskId, providerId: this.id, ref: run }
  }

  async poll(handle: ProviderHandle): Promise<ProviderStatus> {
    const run = this.#run(handle)
    if (run.exited) return { state: 'exited', ...run.exited }
    return run.running ? { state: 'running' } : { state: 'queued' }
  }

  /**
   * 终止执行：杀掉宿主内的 CLI 进程即可——`sandbox do` 的 `delete` 步骤对应的沙箱
   * 名称**不会**由 `do` 暴露（未在官方文档中找到获取方式），因此不走 `sandbox delete`。
   * 沙箱进程随宿主 CLI 进程终止而结束，官方文档说明沙箱「进程退出即删除」。
   *
   * 本方法不区分 reason：终态由 Service 依据先行记录的意图判定（design.md §3.1）。
   */
  async kill(handle: ProviderHandle, _reason: 'cancel' | 'timeout'): Promise<void> {
    const run = this.#run(handle)
    run.killed = true
    run.controller.abort()
    await run.done
  }

  #run(handle: ProviderHandle): SandboxRun {
    const run = this.#runs.get(handle.taskId)
    if (!run) throw new Error(`Unknown cloud run sandbox run: ${handle.taskId}`)
    return run
  }

  /**
   * 组装 `sandbox do` 的 argv。
   *
   * 每个 flag 的官方出处（均见 https://docs.cloud.google.com/run/docs/code-execution）：
   *   - `do`：文档说明其等价于 `run` → `exec` → `delete`，一次性执行。
   *   - `--mount type=bind,source=...,destination=...[,readonly]`：文档给出的绑定挂载形式；
   *     代码与输入只读挂载，产物目录可写。
   *   - `--env KEY=VALUE`：文档原文 "Sandboxes don't inherit environment variables from the
   *     host container. You must explicitly provide them using the `--env` flag."
   *     同页警告 "Avoid passing secrets using the env flag" —— 这里只传路径与 matplotlib 配置，
   *     **绝不传任何凭证**。
   *   - **不传 `--allow-egress`**：文档原文 "By default, all outbound traffic from the sandbox
   *     is blocked. To allow outbound network access, use the `--allow-egress` flag."
   *     禁网靠的就是「不传」，这一行的缺席即是 PRD R3 的实现。
   *   - `--` 之后是沙箱内要执行的命令。
   *
   * **未在官方文档中找到**：资源限制（CPU/内存）相关 flag、超时相关 flag、
   * 结构化输出（如 `--format=json`）flag。故内存限额本 Provider 不下发
   * （沙箱与宿主共享宿主容器的 CPU/内存，见 research §3.3），超时靠沙箱内看门狗
   * + 宿主侧 CLI 进程超时两层，不依赖 CLI 自身。
   */
  #buildArgv(codeDir: string, inputDir: string, outputDir: string): string[] {
    return [
      this.#cliPath,
      'do',
      '--mount',
      `type=bind,source=${codeDir},destination=${SANDBOX_CODE_DIR},readonly`,
      '--mount',
      `type=bind,source=${inputDir},destination=${SANDBOX_INPUT_DIR},readonly`,
      '--mount',
      `type=bind,source=${outputDir},destination=${SANDBOX_OUTPUT_DIR}`,
      '--env',
      `INPUT_DIR=${SANDBOX_INPUT_DIR}`,
      '--env',
      `OUTPUT_DIR=${SANDBOX_OUTPUT_DIR}`,
      // 不设 MPLCONFIGDIR 时 matplotlib 会因配置目录不可写而退回临时目录并拖慢 import
      // （在 fly 上实测，见 design.md §6.2；此处按同一结论预防性设置）。
      '--env',
      `MPLCONFIGDIR=${SANDBOX_OUTPUT_DIR}/.mplconfig`,
      '--env',
      'MPLBACKEND=Agg',
      '--env',
      'PYTHONDONTWRITEBYTECODE=1',
      '--env',
      'LANG=C.UTF-8',
      '--',
      this.#pythonPath,
      `${SANDBOX_CODE_DIR}/runner.py`,
    ]
  }

  async #execute(
    run: SandboxRun,
    spec: ExecutionSpec,
    codeDir: string,
    inputDir: string,
    outputDir: string,
  ): Promise<void> {
    let stdout = ''
    let stderr = ''
    let exitCode = 1
    let artifacts: Artifact[] = []
    try {
      run.running = true
      const output = await this.#runner.run(this.#buildArgv(codeDir, inputDir, outputDir), {
        signal: run.controller.signal,
        timeoutMs: spec.timeoutMs + CLI_TIMEOUT_MARGIN_MS,
      })
      const parsed = parseSandboxDoOutput(output)
      stdout = parsed.stdout
      stderr = parsed.stderr
      exitCode = parsed.exitCode
      if (parsed.exitCodeSource !== 'sentinel' && !run.killed) {
        // 退出码来源不确定时**说出来**，不假装它可靠。
        stderr +=
          `[sandbox] exit code came from the sandbox CLI (${parsed.exitCodeSource}), ` +
          'not from the in-sandbox sentinel; treat it as approximate.\n'
      }
      artifacts = await this.#collectArtifacts(outputDir)
    } catch (error) {
      exitCode = run.killed ? 137 : 127
      if (!run.killed) {
        stderr += `[sandbox] cloud run sandbox provider error: ${describeError(error)}\n`
      }
    } finally {
      run.running = false
      run.exited = {
        exitCode,
        stdout,
        stderr,
        artifacts,
        durationMs: this.#now() - run.startedAt,
      }
      await rm(run.workDir, { recursive: true, force: true })
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
      // 我们自己塞进去的 matplotlib 配置目录不是用户产物。
      if (name.startsWith('.')) continue
      const path = join(outputDir, name)
      const info = await stat(path).catch(() => undefined)
      if (!info?.isFile()) continue
      const mimeType = mimeTypeFor(name)
      if (info.size > this.capabilities.maxInlineOutputBytes) {
        // 超出 inline 上限：只回元数据，由 transport/channel 补 omittedReason。
        artifacts.push({ name, mimeType, sizeBytes: info.size })
        continue
      }
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

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
