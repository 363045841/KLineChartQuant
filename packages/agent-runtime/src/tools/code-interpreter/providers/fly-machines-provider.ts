// 本文件实现 fly.io Machines Provider：每个任务起一台一次性 Machine，exec 执行代码后销毁。
//
// 隔离强度如实记账（design.md §5）：
//   fly 平台**不提供**出站阻断能力（`fly.MachineConfig` 里没有任何 egress/firewall 字段，
//   实测默认出站完全开放）。本 Provider 的禁网由**我们自己的 entrypoint**
//   （`unshare -n` 空 netns + 降权非 root + drop caps）实现——
//   可信基是本项目的 runner，不是 fly.io 平台。故 `enforcesNetworkPolicy` 为 false。
//
// 阈值与超时语义全部来自真实实测（research/fly-live-probe.md）：
//   - exec 响应硬限 10 MiB（JSON 编码后），stdout 与 stderr **共享**该预算；
//   - `config.files[].raw_value` 输入实测 512 KiB 通过 / 768 KiB 失败；
//   - fly 侧「超时」与「取消」外观完全一致（都是被 DELETE 的 destroyed），
//     故终态由 Service 依据自己记录的意图判定，本 Provider 不参与。
import { type Artifact, SOFT_TIMEOUT_EXIT_CODE } from '../contract.js'

import type {
  ExecutionSpec,
  ProviderCapabilities,
  ProviderHandle,
  ProviderStatus,
  RuntimeProvider,
} from './runtime-provider.js'

/** Machines API 的公开 base URL。 */
export const FLY_MACHINES_API_BASE_URL = 'https://api.machines.dev/v1'

const GUEST_ROOT = '/work'
const GUEST_CODE = `${GUEST_ROOT}/main.py`
const GUEST_RUNNER = `${GUEST_ROOT}/runner.py`
const GUEST_ENTRYPOINT = `${GUEST_ROOT}/entrypoint.sh`
const GUEST_INPUT_DIR = `${GUEST_ROOT}/input`
const GUEST_OUTPUT_DIR = `${GUEST_ROOT}/output`

/** 沙箱用户的 uid/gid，与运行时镜像里创建的 `sandbox` 用户一致。 */
const SANDBOX_UID = 1001

/** 单流采集上限；最终 1 MiB 截断由 transport/channel 统一执行。 */
const STREAM_CAPTURE_LIMIT = 1024 * 1024

/** Machine 从 created 到 started 的等待上限（秒）。实测 prepared 镜像约 3.5s。 */
const START_WAIT_SECONDS = 60

/** 传递软超时预算的环境变量名；由 exec 命令行注入，entrypoint 再 export 给 runner.py。 */
const SOFT_TIMEOUT_ENV = 'KQ_SOFT_TIMEOUT_MS'

/**
 * 软超时相对于「剩余硬超时预算」的提前量（毫秒）。
 * 留给沙箱写完 stderr、控制面取产物并销毁 Machine 的收尾时间。
 */
const SOFT_TIMEOUT_MARGIN_MS = 5000

/**
 * 软超时的最小有效值。剩余预算低于此值时再发 exec 也注定被硬超时打断，
 * 不如直接按 timed_out 收敛（诚实优于发一个必然失败的请求）。
 */
const MIN_SOFT_TIMEOUT_MS = 1000

/** 产物名允许的字符集；超出者不进 shell 命令，直接跳过（宁可少一个产物，也不拼危险命令）。 */
const SAFE_ARTIFACT_NAME = /^[A-Za-z0-9._-]{1,255}$/

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

function toBase64(value: string, encoding: 'utf8' | 'base64'): string {
  return encoding === 'base64' ? value : Buffer.from(value, 'utf8').toString('base64')
}

/**
 * 沙箱内的 Python 宿主：软超时看门狗 + 单流 1 MiB 上限。
 *
 * 流量必须在 guest 内封顶：exec 响应有 10 MiB 编码硬限且 stdout/stderr 共享，
 * 写爆之后整个响应会失败，连退出码都拿不到（实测）。
 *
 * **软超时值不再烤进源码**（fly-live-probe.md §10.3 的缺陷）：
 * 本文件在 machine create 时刻下发，而 exec 要等约 18s 冷启动才发生，
 * 固化的值会让看门狗触发点晚于控制面硬超时，`124` 路径永远不可达。
 * 现改为从 `KQ_SOFT_TIMEOUT_MS` 读取——该值由控制面在 **exec 时刻**按剩余预算计算。
 *
 * 取不到或非法时**fail closed**：不执行用户代码，直接以 `SOFT_TIMEOUT_EXIT_CODE` 退出
 * 并在 stderr 说明原因。宁可显式失败，也不跑一段没有看门狗兜底的代码。
 */
function runnerSource(): string {
  return [
    'import os, runpy, sys, threading',
    `_KQ_LIMIT = ${STREAM_CAPTURE_LIMIT}`,
    'class _KQCapped:',
    '    def __init__(self, raw):',
    '        self._raw = raw',
    '        self._written = 0',
    '        self._marked = False',
    '    def write(self, text):',
    '        data = text.encode("utf-8", "replace")',
    '        room = _KQ_LIMIT - self._written',
    '        if room > 0:',
    '            self._raw.write(data[:room])',
    '            self._written += min(room, len(data))',
    '        elif not self._marked:',
    '            self._marked = True',
    '            self._raw.write(b"\\n[truncated: sandbox stream limit reached]\\n")',
    '        return len(text)',
    '    def flush(self):',
    '        self._raw.flush()',
    '    def isatty(self):',
    '        return False',
    'sys.stdout = _KQCapped(sys.stdout.buffer)',
    'sys.stderr = _KQCapped(sys.stderr.buffer)',
    'def _kq_soft_timeout():',
    '    sys.stderr.write("[sandbox] soft timeout reached\\n")',
    '    sys.stderr.flush()',
    `    os._exit(${SOFT_TIMEOUT_EXIT_CODE})`,
    `_kq_budget_ms = os.environ.get("${SOFT_TIMEOUT_ENV}", "")`,
    'try:',
    '    _kq_budget_ms = int(_kq_budget_ms)',
    'except ValueError:',
    '    _kq_budget_ms = 0',
    'if _kq_budget_ms <= 0:',
    // fail closed：没有可信的看门狗预算就不执行用户代码。
    `    sys.stderr.write("[sandbox] missing or invalid ${SOFT_TIMEOUT_ENV}; refusing to run\\n")`,
    '    sys.stderr.flush()',
    `    os._exit(${SOFT_TIMEOUT_EXIT_CODE})`,
    '_kq_timer = threading.Timer(_kq_budget_ms / 1000.0, _kq_soft_timeout)',
    '_kq_timer.daemon = True',
    '_kq_timer.start()',
    `sys.argv = ["${GUEST_CODE}"]`,
    `runpy.run_path("${GUEST_CODE}", run_name="__main__")`,
    '',
  ].join('\n')
}

/**
 * 隔离序列，**顺序不可调换**（design.md §5.1，已在真实 fly.io 上实测）：
 *
 *   umount /.fly/api → unshare -n → setpriv 降权 + drop caps → exec 用户代码
 *
 * 先卸载再降权：降权之后就没有权限 unmount 了。
 * `/.fly/api` 是 Unix domain socket，**不受 network namespace 管辖**，
 * 必须显式移除，不能指望 `unshare -n` 挡住它。
 */
function entrypointSource(): string {
  return [
    '#!/bin/sh',
    'set -u',
    '',
    '# 1) 先处置 /.fly/api —— netns 管不到 Unix socket，只能显式移除。',
    'umount /.fly/api 2>/dev/null || true',
    'rm -f /.fly/api 2>/dev/null || true',
    '',
    '# 2) 沙箱用户专属的可写目录；$OUTPUT_DIR 必须属于沙箱用户，',
    '#    否则降权后写入直接 PermissionError（实测）。',
    `mkdir -p ${GUEST_OUTPUT_DIR} ${GUEST_ROOT}/home ${GUEST_ROOT}/mplconfig`,
    `chown ${SANDBOX_UID}:${SANDBOX_UID} ${GUEST_OUTPUT_DIR} ${GUEST_ROOT}/home ${GUEST_ROOT}/mplconfig`,
    `chmod 0755 ${GUEST_ROOT} ${GUEST_INPUT_DIR} 2>/dev/null || true`,
    '',
    `export HOME=${GUEST_ROOT}/home`,
    `export INPUT_DIR=${GUEST_INPUT_DIR}`,
    `export OUTPUT_DIR=${GUEST_OUTPUT_DIR}`,
    // 不设 MPLCONFIGDIR 时 matplotlib 报 /.config 不可写并显著拖慢 import（实测）。
    `export MPLCONFIGDIR=${GUEST_ROOT}/mplconfig`,
    'export MPLBACKEND=Agg',
    'export LANG=C.UTF-8',
    'export PYTHONDONTWRITEBYTECODE=1',
    '',
    '# 软超时预算由控制面在 exec 时刻按剩余预算下发（argv $1），这里转成环境变量',
    '# 交给 runner.py —— 不能在 machine create 时刻固化，冷启动会吃掉一大截预算。',
    `export ${SOFT_TIMEOUT_ENV}="\${1:-}"`,
    `cd ${GUEST_INPUT_DIR} || cd /`,
    '',
    '# 3) 空 netns → 降权非 root → 清空 capabilities → exec 用户代码。',
    'exec unshare -n setpriv \\',
    `  --reuid=${SANDBOX_UID} --regid=${SANDBOX_UID} --clear-groups \\`,
    '  --inh-caps=-all --bounding-set=-all \\',
    `  python3 ${GUEST_RUNNER}`,
    '',
  ].join('\n')
}

interface FlyFile {
  readonly guest_path: string
  readonly raw_value: string
}

interface FlyExecResponse {
  readonly exit_code?: number
  readonly exit_signal?: number
  readonly stdout?: string
  readonly stderr?: string
}

export interface FlyMachinesProviderOptions {
  /** Machines API token。**只在内存中流转，任何日志与错误信息都不得包含它。** */
  readonly token: string
  /** 承载沙箱 Machine 的 fly app（必须已存在）。 */
  readonly appName: string
  /** 预构建的运行时镜像，例如 `registry.fly.io/<app>:python-data-analysis-v1`。 */
  readonly image: string
  readonly region?: string
  readonly baseUrl?: string
  readonly fetchImpl?: typeof fetch
  /** 仅供测试注入。 */
  readonly now?: () => number
}

interface FlyRun {
  readonly startedAt: number
  machineId?: string
  running: boolean
  killed: boolean
  readonly controller: AbortController
  exited?: {
    exitCode: number
    stdout: string
    stderr: string
    artifacts: Artifact[]
    durationMs: number
  }
  done: Promise<void>
}

/** 缺少任一必需配置即返回 undefined —— 无凭证时 Provider 不注册，但**绝不让 Agent 启动失败**。 */
export function createFlyMachinesProviderFromEnv(
  env: Record<string, string | undefined> = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env ?? {},
): FlyMachinesProvider | undefined {
  const token = env['FLY_API_TOKEN']
  const appName = env['KQ_CODE_INTERPRETER_FLY_APP']
  const image = env['KQ_CODE_INTERPRETER_FLY_IMAGE']
  if (!token || !appName || !image) return undefined
  const region = env['KQ_CODE_INTERPRETER_FLY_REGION']
  return new FlyMachinesProvider({
    token,
    appName,
    image,
    ...(region ? { region } : {}),
  })
}

/**
 * fly.io Machines 运行时。
 *
 * 形态：每任务一台一次性 Machine（init 为 `sleep` 常驻）→ exec 跑隔离序列 →
 * 独立 exec 取产物 → DELETE 销毁。exec 是唯一有官方 schema 保证、
 * 能同时拿到 `exit_code` / `stdout` / `stderr` 的路径。
 *
 * 产物**不与日志共用同一次 exec 响应**：raw 合计 2.5 MiB 即耗尽 10 MiB 编码预算（实测）。
 */
export class FlyMachinesProvider implements RuntimeProvider {
  readonly id = 'fly-machines' as const
  readonly capabilities: ProviderCapabilities = {
    // 实测 512 KiB 通过 / 768 KiB 报 `request body too large`，取 50% 留余量。
    maxInlineInputBytes: 256 * 1024,
    // 单个产物走独立 exec 调用，10 MiB 编码预算下 1 MiB raw 是安全线。
    maxInlineOutputBytes: 1024 * 1024,
    // 挂载通道（volume）本版未实现：超阈值直接明确拒绝，不静默截断。
    supportsMount: false,
    // fly 平台不提供出站阻断；禁网由本项目的 runner 镜像实现，可信基不同。
    enforcesNetworkPolicy: false,
  }

  readonly #options: FlyMachinesProviderOptions
  readonly #fetch: typeof fetch
  readonly #baseUrl: string
  readonly #now: () => number
  readonly #runs = new Map<string, FlyRun>()

  constructor(options: FlyMachinesProviderOptions) {
    this.#options = options
    this.#fetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
    this.#baseUrl = (options.baseUrl ?? FLY_MACHINES_API_BASE_URL).replace(/\/+$/, '')
    this.#now = options.now ?? (() => Date.now())
  }

  async start(spec: ExecutionSpec, signal: AbortSignal): Promise<ProviderHandle> {
    const controller = new AbortController()
    const run: FlyRun = {
      startedAt: this.#now(),
      running: false,
      killed: false,
      controller,
      done: Promise.resolve(),
    }
    const onAbort = (): void => {
      run.killed = true
      controller.abort()
    }
    signal.addEventListener('abort', onAbort, { once: true })
    run.done = this.#execute(run, spec).finally(() => {
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
   * 终止执行。fly 侧超时与取消**外观完全一致**，本方法不区分 reason——
   * 终态由 Service 依据自己先行记录的意图判定（design.md §3.1）。
   */
  async kill(handle: ProviderHandle, _reason: 'cancel' | 'timeout'): Promise<void> {
    const run = this.#run(handle)
    run.killed = true
    run.controller.abort()
    await run.done
  }

  #run(handle: ProviderHandle): FlyRun {
    const run = this.#runs.get(handle.taskId)
    if (!run) throw new Error(`Unknown fly machines run: ${handle.taskId}`)
    return run
  }

  async #execute(run: FlyRun, spec: ExecutionSpec): Promise<void> {
    let stdout = ''
    let stderr = ''
    let exitCode = 1
    let artifacts: Artifact[] = []
    try {
      const machineId = await this.#createMachine(run, spec)
      run.machineId = machineId
      await this.#waitStarted(run, machineId)
      run.running = true
      // 软超时按 **exec 时刻的剩余预算** 计算，不能沿用 submit 时刻的总预算：
      // fly 冷启动实测约 18s，固化的软超时点会晚于控制面硬超时，`124` 永远不可达
      // （fly-live-probe.md §10.3）。
      const softTimeoutMs = spec.timeoutMs - (this.#now() - run.startedAt) - SOFT_TIMEOUT_MARGIN_MS
      if (softTimeoutMs < MIN_SOFT_TIMEOUT_MS) {
        // 冷启动已吃光预算：不发这次注定被硬超时打断的 exec，直接按超时收敛。
        // 退出码用 SOFT_TIMEOUT_EXIT_CODE，Service 据此判定 timed_out（design.md §3.1）。
        stderr = '[sandbox] execution budget exhausted before the sandbox was ready\n'
        exitCode = SOFT_TIMEOUT_EXIT_CODE
        return
      }
      // exec 必须显式设超时（实测默认较短会 deadline_exceeded），
      // 并留出沙箱软超时之后收尾的余量。
      const execTimeout = Math.ceil(softTimeoutMs / 1000) + 10
      const response = await this.#exec(
        run,
        machineId,
        ['/bin/sh', GUEST_ENTRYPOINT, String(softTimeoutMs)],
        execTimeout,
      )
      stdout = response.stdout ?? ''
      stderr = response.stderr ?? ''
      exitCode = response.exit_code ?? (response.exit_signal ? 128 + response.exit_signal : 1)
      artifacts = await this.#collectArtifacts(run, machineId)
    } catch (error) {
      if (run.killed) {
        // 被取消/超时终止：终态由 Service 的意图决定，这里的退出码只是占位。
        exitCode = 137
      } else {
        exitCode = 127
        stderr += `[sandbox] fly machines provider error: ${describeError(error)}\n`
      }
    } finally {
      await this.#destroyMachine(run.machineId)
      run.running = false
      run.exited = {
        exitCode,
        stdout,
        stderr,
        artifacts,
        durationMs: this.#now() - run.startedAt,
      }
    }
  }

  async #createMachine(run: FlyRun, spec: ExecutionSpec): Promise<string> {
    const files: FlyFile[] = [
      { guest_path: GUEST_CODE, raw_value: toBase64(spec.code, 'utf8') },
      { guest_path: GUEST_RUNNER, raw_value: toBase64(runnerSource(), 'utf8') },
      { guest_path: GUEST_ENTRYPOINT, raw_value: toBase64(entrypointSource(), 'utf8') },
    ]
    for (const file of spec.files) {
      if (!SAFE_ARTIFACT_NAME.test(file.name)) {
        throw new Error(`Unsupported input file name: ${file.name}`)
      }
      files.push({
        guest_path: `${GUEST_INPUT_DIR}/${file.name}`,
        raw_value: toBase64(file.content, file.encoding ?? 'utf8'),
      })
    }

    // init 用 sleep 让 Machine 常驻，真正的执行走 exec；
    // sleep 的时长比预算多留一截，作为「控制面失联」时的最后兜底。
    const idleSeconds = Math.ceil(spec.timeoutMs / 1000) + 120
    const body = {
      name: `kq-ci-${spec.taskId
        .replace(/[^a-z0-9]/gi, '')
        .slice(0, 20)
        .toLowerCase()}`,
      ...(this.#options.region ? { region: this.#options.region } : {}),
      config: {
        image: this.#options.image,
        auto_destroy: true,
        restart: { policy: 'no' },
        guest: { cpu_kind: 'shared', cpus: 1, memory_mb: spec.memoryMb },
        init: { exec: ['/bin/sleep', String(idleSeconds)] },
        files,
      },
    }
    const machine = await this.#request<{ id?: string }>(
      run,
      'POST',
      `/apps/${this.#options.appName}/machines`,
      body,
    )
    if (!machine.id) throw new Error('fly machines API returned no machine id')
    return machine.id
  }

  async #waitStarted(run: FlyRun, machineId: string): Promise<void> {
    await this.#request(
      run,
      'GET',
      `/apps/${this.#options.appName}/machines/${machineId}/wait` +
        `?state=started&timeout=${START_WAIT_SECONDS}`,
    )
  }

  async #exec(
    run: FlyRun,
    machineId: string,
    command: readonly string[],
    timeoutSeconds: number,
  ): Promise<FlyExecResponse> {
    return await this.#request<FlyExecResponse>(
      run,
      'POST',
      `/apps/${this.#options.appName}/machines/${machineId}/exec`,
      { command, timeout: timeoutSeconds },
    )
  }

  /**
   * 只捕获 `$OUTPUT_DIR` 的**顶层文件**（design.md §6.2）。
   * 每个产物一次独立的 exec 调用——不与日志抢同一份 10 MiB 编码预算。
   */
  async #collectArtifacts(run: FlyRun, machineId: string): Promise<Artifact[]> {
    const listing = await this.#exec(
      run,
      machineId,
      [
        '/bin/sh',
        '-c',
        `cd ${GUEST_OUTPUT_DIR} 2>/dev/null || exit 0; ` +
          'for f in *; do [ -f "$f" ] && stat -c "%s %n" "$f"; done',
      ],
      30,
    )
    const artifacts: Artifact[] = []
    for (const line of (listing.stdout ?? '').split('\n')) {
      const match = /^(\d+) (.+)$/.exec(line.trim())
      if (!match) continue
      const sizeBytes = Number(match[1])
      const name = match[2] as string
      if (!SAFE_ARTIFACT_NAME.test(name)) continue
      const mimeType = mimeTypeFor(name)
      if (sizeBytes > this.capabilities.maxInlineOutputBytes) {
        // 超出 inline 上限：只回元数据，由 transport/channel 补 omittedReason。
        artifacts.push({ name, mimeType, sizeBytes })
        continue
      }
      const encoded = await this.#exec(
        run,
        machineId,
        ['/bin/sh', '-c', `base64 -w0 ${GUEST_OUTPUT_DIR}/${name}`],
        30,
      )
      const base64 = (encoded.stdout ?? '').trim()
      const isText = TEXT_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix))
      artifacts.push({
        name,
        mimeType,
        sizeBytes,
        encoding: isText ? 'utf8' : 'base64',
        content: isText ? Buffer.from(base64, 'base64').toString('utf8') : base64,
      })
    }
    return artifacts.sort((left, right) => left.name.localeCompare(right.name))
  }

  async #destroyMachine(machineId: string | undefined): Promise<void> {
    if (!machineId) return
    try {
      // 销毁走独立的 AbortSignal：取消路径下 run.controller 已经 abort，
      // 不能因此把清理也一起取消掉，否则会漏资源。
      await this.#send(
        'DELETE',
        `/apps/${this.#options.appName}/machines/${machineId}?force=true`,
        undefined,
        AbortSignal.timeout(30_000),
      )
    } catch {
      // 清理失败不改变执行结果；Machine 的 init sleep 到点后会自行退出并 auto_destroy。
    }
  }

  async #request<T = unknown>(
    run: FlyRun,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    return await this.#send<T>(method, path, body, run.controller.signal)
  }

  async #send<T = unknown>(
    method: string,
    path: string,
    body: unknown,
    signal: AbortSignal,
  ): Promise<T> {
    const response = await this.#fetch(`${this.#baseUrl}${path}`, {
      method,
      headers: {
        // token 只出现在这里；任何日志/错误信息都不得回显它。
        authorization: `Bearer ${this.#options.token}`,
        'content-type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal,
    })
    const text = await response.text()
    if (!response.ok) {
      throw new Error(`fly machines API ${method} ${path} failed: ${response.status} ${text}`)
    }
    if (!text) return undefined as T
    return JSON.parse(text) as T
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
