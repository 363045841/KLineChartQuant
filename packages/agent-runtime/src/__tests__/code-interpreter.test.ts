// 本测试对着**真实的 Python 子进程**驱动 LocalProvider，不使用假 Provider。
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { getRegisteredChartTools } from '@363045841yyt/klinechart-core/agent-tools'
import { describe, expect, it } from 'vitest'

import {
  CODE_INTERPRETER_TOOL_NAME,
  CodeInterpreterService,
  CodeInterpreterTool,
  ExecutionRejectedError,
  type ExecutionResult,
  MAX_STREAM_BYTES,
  selectChannel,
  truncateStream,
} from '../tools/code-interpreter/index.js'
import {
  CloudRunSandboxProvider,
  createCloudRunSandboxProviderFromEnv,
  parseSandboxDoOutput,
  type SandboxCommandOutput,
  type SandboxCommandRunner,
} from '../tools/code-interpreter/providers/cloud-run-sandbox-provider.js'
import {
  createFlyMachinesProviderFromEnv,
  FlyMachinesProvider,
} from '../tools/code-interpreter/providers/fly-machines-provider.js'
import {
  LocalProvider,
  resolveLocalCommand,
} from '../tools/code-interpreter/providers/local-provider.js'

function hasPython(): boolean {
  try {
    execFileSync('python3', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const python = hasPython()
const describePython = python ? describe : describe.skip

function createService(): CodeInterpreterService {
  return new CodeInterpreterService({
    provider: new LocalProvider({ suppressIsolationWarning: true }),
  })
}

/** 轮询到终态；不允许无限等待。 */
async function settle(
  service: CodeInterpreterService,
  taskId: string,
  deadlineMs = 30_000,
): Promise<ExecutionResult> {
  const deadline = Date.now() + deadlineMs
  for (;;) {
    const result = await service.get(taskId)
    if (result.status !== 'queued' && result.status !== 'running') return result
    if (Date.now() > deadline) throw new Error(`Task ${taskId} did not settle in ${deadlineMs}ms`)
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

// LocalProvider 的隔离选择是纯函数，无需 Python 即可断言（issue #193）：
// Linux 只有在 `unshare -rn` 实测可用时才隔离，否则与 macOS/Windows 一样直跑。
describe('LocalProvider isolation selection (issue #193)', () => {
  const base = { pythonPath: '/usr/bin/python3', runnerPath: '/tmp/kq/runner.py' }
  const unsharePath = '/usr/bin/unshare'

  it('isolates on Linux when `unshare -rn` is usable', () => {
    expect(
      resolveLocalCommand({
        ...base,
        platform: 'linux',
        unsharePath,
        unshareUsable: true,
      }),
    ).toEqual({
      command: unsharePath,
      args: ['-rn', '--', base.pythonPath, base.runnerPath],
      isolated: true,
    })
  })

  const directRunCases: Array<[string, NodeJS.Platform, string | null, boolean]> = [
    ['the probe failed (AppArmor blocks unprivileged userns)', 'linux', unsharePath, false],
    ['unshare is absent', 'linux', null, false],
    ['the platform is macOS', 'darwin', unsharePath, true],
    ['the platform is Windows', 'win32', unsharePath, true],
  ]

  it.each(directRunCases)(
    'degrades to a direct run when %s',
    (_case, platform, unsharePathForCase, unshareUsable) => {
      expect(
        resolveLocalCommand({
          ...base,
          platform,
          unsharePath: unsharePathForCase,
          unshareUsable,
        }),
      ).toEqual({ command: base.pythonPath, args: [base.runnerPath], isolated: false })
    },
  )
})

describe('code_interpreter registration (AC1)', () => {
  it('registers into the core ChartToolRegistry as a destructive tool', () => {
    const tool = getRegisteredChartTools().find(
      (candidate) => candidate.config.name === CODE_INTERPRETER_TOOL_NAME,
    )
    expect(tool).toBeDefined()
    expect(tool?.config.safety).toBe('destructive')
    expect(tool?.methodName).toBe('runPython')
    expect(tool?.owns(new CodeInterpreterTool(createService()))).toBe(true)
  })

  it('rejects invalid input through the registry validation path', async () => {
    const tool = getRegisteredChartTools().find(
      (candidate) => candidate.config.name === CODE_INTERPRETER_TOOL_NAME,
    )
    await expect(
      tool?.execute(
        new CodeInterpreterTool(createService()),
        { code: 123 },
        {
          signal: new AbortController().signal,
          progress: () => undefined,
        },
      ),
    ).rejects.toThrow(TypeError)
  })
})

describePython('CodeInterpreterService over a real Python subprocess (AC2)', () => {
  it('succeeds: reads a CSV input and emits stdout plus an artifact', async () => {
    const service = createService()
    const { taskId, status } = await service.submit({
      language: 'python',
      code: [
        'import csv, os',
        'with open(os.path.join(os.environ["INPUT_DIR"], "data.csv")) as handle:',
        '    rows = list(csv.DictReader(handle))',
        'total = sum(int(row["close"]) for row in rows)',
        'print("total", total)',
        'with open(os.path.join(os.environ["OUTPUT_DIR"], "summary.csv"), "w") as handle:',
        '    handle.write("total\\n%d\\n" % total)',
      ].join('\n'),
      files: [{ name: 'data.csv', content: 'close\n1\n2\n3\n' }],
      policy: { network: 'disabled', packages: 'base' },
      limits: { timeoutMs: 20_000 },
    })
    expect(status).toBe('queued')

    const result = await settle(service, taskId)
    expect(result.status).toBe('succeeded')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('total 6')
    expect(result.artifacts).toHaveLength(1)
    expect(result.artifacts[0]?.name).toBe('summary.csv')
    expect(result.artifacts[0]?.mimeType).toBe('text/csv')
    expect(result.artifacts[0]?.content).toBe('total\n6\n')
    expect(result.usage?.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('fails: a raising script settles as failed with the traceback on stderr', async () => {
    const service = createService()
    const { taskId } = await service.submit({
      language: 'python',
      code: 'raise ValueError("boom")',
      limits: { timeoutMs: 20_000 },
    })
    const result = await settle(service, taskId)
    expect(result.status).toBe('failed')
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).toContain('ValueError: boom')
    expect(result.artifacts).toEqual([])
  })

  it('times out: the in-sandbox watchdog exits with 124 and the control plane reports timed_out', async () => {
    const service = createService()
    const { taskId } = await service.submit({
      language: 'python',
      code: 'import time\nprint("before", flush=True)\ntime.sleep(60)',
      limits: { timeoutMs: 1500 },
    })
    const result = await settle(service, taskId, 15_000)
    expect(result.status).toBe('timed_out')
    expect(result.stdout).toContain('before')
  })

  it('cancels: cancel() wins over the platform exit code and settles as cancelled', async () => {
    const service = createService()
    const { taskId } = await service.submit({
      language: 'python',
      code: 'import time\nprint("started", flush=True)\ntime.sleep(60)',
      limits: { timeoutMs: 30_000 },
    })
    // 等到进程确实在跑，确保取消的是真实子进程。
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const pending = await service.get(taskId)
      if (pending.status === 'running') break
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    await service.cancel(taskId)
    const result = await settle(service, taskId, 15_000)
    expect(result.status).toBe('cancelled')
  })

  it('drives the registered tool end to end and reports progress', async () => {
    const tool = getRegisteredChartTools().find(
      (candidate) => candidate.config.name === CODE_INTERPRETER_TOOL_NAME,
    )
    const labels: string[] = []
    const result = (await tool?.execute(
      new CodeInterpreterTool(createService()),
      { code: 'print("hello from tool")', timeoutMs: 20_000 },
      { signal: new AbortController().signal, progress: (update) => labels.push(update.label) },
    )) as ExecutionResult
    expect(result.status).toBe('succeeded')
    expect(result.stdout).toContain('hello from tool')
    expect(labels).toContain('queued')
  })
})

describe('transport policy', () => {
  it('rejects oversized inputs instead of silently truncating them', () => {
    const capabilities = {
      maxInlineInputBytes: 8,
      maxInlineOutputBytes: 8,
      supportsMount: false,
      enforcesNetworkPolicy: false,
    }
    expect(() => selectChannel([{ name: 'a.csv', content: 'x'.repeat(64) }], capabilities)).toThrow(
      ExecutionRejectedError,
    )
    expect(selectChannel([{ name: 'a.csv', content: 'xx' }], capabilities)).toBe('inline')
  })

  it('truncates streams at 1 MiB and marks the cut', () => {
    const truncated = truncateStream('a'.repeat(MAX_STREAM_BYTES + 10))
    expect(truncated).toContain('[truncated')
    expect(truncated.startsWith('a'.repeat(1000))).toBe(true)
  })
})

describe('request policy', () => {
  it('only accepts network "disabled"', async () => {
    const service = createService()
    await expect(
      service.submit({
        language: 'python',
        code: 'pass',
        policy: { network: 'enabled' as 'disabled', packages: 'base' },
      }),
    ).rejects.toThrow(ExecutionRejectedError)
  })
})

// 本节用假 fetch 驱动 FlyMachinesProvider，只验证「协议编排」这一层：
// 请求序列、隔离序列是否下发、产物是否走独立 exec 调用、销毁是否发生。
// **真实环境的行为以 research/fly-live-probe.md §10 的实测为准**，不靠这些断言代替。
describe('FlyMachinesProvider wiring', () => {
  it('does not register without credentials (agent must still start)', () => {
    expect(createFlyMachinesProviderFromEnv({})).toBeUndefined()
    expect(createFlyMachinesProviderFromEnv({ FLY_API_TOKEN: 't' })).toBeUndefined()
    expect(
      createFlyMachinesProviderFromEnv({
        FLY_API_TOKEN: 't',
        KQ_CODE_INTERPRETER_FLY_APP: 'app',
        KQ_CODE_INTERPRETER_FLY_IMAGE: 'img',
      }),
    ).toBeInstanceOf(FlyMachinesProvider)
  })

  it('never claims platform-enforced network policy', () => {
    const provider = new FlyMachinesProvider({ token: 't', appName: 'app', image: 'img' })
    // fly 平台不提供出站阻断；禁网可信基是我们的 runner 镜像（design.md §5.2）。
    expect(provider.capabilities.enforcesNetworkPolicy).toBe(false)
  })

  it('creates a machine, execs the isolation entrypoint, fetches artifacts separately, destroys', async () => {
    interface FlyCall {
      method: string
      url: string
      body?: {
        command?: string[]
        config?: { files: Array<{ guest_path: string; raw_value: string }> }
      }
    }
    const calls: FlyCall[] = []
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input)
      const body = init?.body ? (JSON.parse(init.body as string) as FlyCall['body']) : undefined
      calls.push({ method: String(init?.method), url, body })
      const path = url
      if (path.endsWith('/machines') && init?.method === 'POST') {
        return new Response(JSON.stringify({ id: 'm1' }), { status: 200 })
      }
      if (path.includes('/exec')) {
        const command = (body?.command ?? []).join(' ')
        if (command.includes('entrypoint.sh')) {
          return new Response(JSON.stringify({ exit_code: 0, stdout: 'hi\n', stderr: '' }), {
            status: 200,
          })
        }
        if (command.includes('stat -c')) {
          return new Response(JSON.stringify({ exit_code: 0, stdout: '3 out.csv\n', stderr: '' }), {
            status: 200,
          })
        }
        return new Response(
          JSON.stringify({ exit_code: 0, stdout: Buffer.from('a,b').toString('base64') }),
          { status: 200 },
        )
      }
      return new Response('', { status: 200 })
    }

    const provider = new FlyMachinesProvider({
      token: 'secret-token',
      appName: 'app',
      image: 'img',
      fetchImpl,
    })
    const service = new CodeInterpreterService({ provider })
    const task = await service.submit({ language: 'python', code: 'print(1)' })
    const result = await settle(service, task.taskId)

    expect(result.status).toBe('succeeded')
    expect(result.stdout).toBe('hi\n')
    expect(result.artifacts).toEqual([
      { name: 'out.csv', mimeType: 'text/csv', sizeBytes: 3, encoding: 'utf8', content: 'a,b' },
    ])

    const create = calls.find((call) => call.url.endsWith('/machines'))
    const entrypoint = Buffer.from(
      create?.body?.config?.files.find((file) => file.guest_path.endsWith('entrypoint.sh'))
        ?.raw_value ?? '',
      'base64',
    ).toString('utf8')
    // 隔离序列顺序不可调换：先卸载 /.fly/api，再空 netns，最后降权 drop caps。
    expect(entrypoint.indexOf('/.fly/api')).toBeLessThan(entrypoint.indexOf('unshare -n'))
    expect(entrypoint).toContain('--reuid=1001')
    expect(entrypoint).toContain('--bounding-set=-all')
    expect(entrypoint).toContain('MPLCONFIGDIR=')
    expect(entrypoint).toContain('chown 1001:1001')

    // 产物取用独立的 exec 调用，不与日志共用同一次响应（实测预算约束）。
    expect(calls.filter((call) => call.url.includes('/exec')).length).toBe(3)
    expect(calls.some((call) => call.method === 'DELETE' && call.url.includes('force=true'))).toBe(
      true,
    )
  })
})

// 软超时计时基准（fly-live-probe.md §10.3 缺陷修复）。
// 时钟通过 `now` 注入，全部为确定性断言，不依赖真实时钟 sleep。
describe('FlyMachinesProvider soft timeout budget', () => {
  interface Harness {
    readonly provider: FlyMachinesProvider
    readonly execCommands: string[][]
    settle(): Promise<{ exitCode: number; stdout: string; stderr: string }>
  }

  /** `coldStartMs`：从 start() 到 exec 发起之间（create + wait started）消耗的时间。 */
  function createHarness(coldStartMs: number, timeoutMs = 60_000): Harness {
    let clock = 1_000_000
    const execCommands: string[][] = []
    const fetchImpl: typeof fetch = async (input, init) => {
      const path = String(input)
      const body = init?.body
        ? (JSON.parse(init.body as string) as { command?: string[] })
        : undefined
      if (path.endsWith('/machines') && init?.method === 'POST') {
        return new Response(JSON.stringify({ id: 'm1' }), { status: 200 })
      }
      if (path.includes('/wait')) {
        clock += coldStartMs // 冷启动只发生在这里
        return new Response('', { status: 200 })
      }
      if (path.includes('/exec')) {
        const command = body?.command ?? []
        execCommands.push(command)
        if (command.join(' ').includes('entrypoint.sh')) {
          return new Response(JSON.stringify({ exit_code: 0, stdout: 'ok\n' }), { status: 200 })
        }
        return new Response(JSON.stringify({ exit_code: 0, stdout: '' }), { status: 200 })
      }
      return new Response('', { status: 200 })
    }

    const provider = new FlyMachinesProvider({
      token: 't',
      appName: 'app',
      image: 'img',
      fetchImpl,
      now: () => clock,
    })
    const spec = {
      taskId: 'task-soft-timeout',
      language: 'python',
      code: 'pass',
      files: [],
      timeoutMs,
      softTimeoutMs: timeoutMs - 5000,
      memoryMb: 1024,
      channel: 'inline',
    } as const
    return {
      provider,
      execCommands,
      async settle() {
        const handle = await provider.start(spec, new AbortController().signal)
        for (;;) {
          const status = await provider.poll(handle)
          if (status.state === 'exited') {
            return { exitCode: status.exitCode, stdout: status.stdout, stderr: status.stderr }
          }
          await new Promise((resolve) => setTimeout(resolve, 1))
        }
      },
    }
  }

  it('passes the budget remaining at exec time, not the submit-time budget', async () => {
    const harness = createHarness(18_000)
    const result = await harness.settle()

    expect(result.exitCode).toBe(0)
    const entrypointCall = harness.execCommands.find((command) =>
      command.some((part) => part.endsWith('entrypoint.sh')),
    )
    // 60000 总预算 - 18000 冷启动 - 5000 安全余量 = 37000，而不是 submit 时刻的 55000。
    expect(entrypointCall?.[2]).toBe('37000')
  })

  it('converges to the soft-timeout exit code when the cold start ate the budget', async () => {
    const harness = createHarness(59_000)
    const result = await harness.settle()

    // 不发那次注定被硬超时打断的 exec，直接按超时收敛。
    expect(result.exitCode).toBe(124)
    expect(result.stderr).toContain('budget exhausted')
    expect(
      harness.execCommands.some((command) =>
        command.some((part) => part.endsWith('entrypoint.sh')),
      ),
    ).toBe(false)
  })
})

// ⚠️ 本节全部是**协议编排测试，不是端到端验证**。
// Cloud Run sandboxes 需要跑在 `sandboxLauncher: true` 的 GCP 容器里，本仓库没有 GCP 环境，
// 该 Provider **从未对真实环境跑过**。下列断言只覆盖我们自己能负责的那一层：
// argv 组装（含「不传 --allow-egress」）、CLI 输出解析的容错、状态映射、无凭证不注册。
// 真实 CLI 的输出格式官方无稳定性承诺，任何断言都不得被理解为对真实行为的验证。
describe('CloudRunSandboxProvider (protocol orchestration only; NOT live-verified)', () => {
  const baseEnv = {
    KQ_CODE_INTERPRETER_CLOUD_RUN_SANDBOX: '1',
    KQ_CODE_INTERPRETER_SANDBOX_CLI: '/usr/local/gcp/bin/sandbox',
  }

  it('does not register without the launcher host (agent must still start)', () => {
    expect(createCloudRunSandboxProviderFromEnv({}, () => true)).toBeUndefined()
    // 开关开了但 CLI 不存在（例如开发机误配）→ 依然不注册，且不抛错。
    expect(createCloudRunSandboxProviderFromEnv(baseEnv, () => false)).toBeUndefined()
    expect(createCloudRunSandboxProviderFromEnv(baseEnv, () => true)).toBeInstanceOf(
      CloudRunSandboxProvider,
    )
  })

  it('is the only provider that claims platform-enforced network policy', () => {
    const provider = new CloudRunSandboxProvider()
    // 依据官方文档："By default, all outbound traffic from the sandbox is blocked."
    expect(provider.capabilities.enforcesNetworkPolicy).toBe(true)
    expect(provider.capabilities.supportsMount).toBe(false)
  })

  /** 假 CLI 执行器：记录 argv，可选地往产物目录写文件，并返回给定的 CLI 输出。 */
  function fakeRunner(
    output: SandboxCommandOutput,
    onOutputDir?: (dir: string) => Promise<void>,
  ): { runner: SandboxCommandRunner; argvs: string[][] } {
    const argvs: string[][] = []
    return {
      argvs,
      runner: {
        async run(argv) {
          argvs.push([...argv])
          const mount = argv.find((value) => value.includes('destination=/mnt/out'))
          const dir = /source=([^,]+)/.exec(mount ?? '')?.[1]
          if (dir && onOutputDir) await onOutputDir(dir)
          return output
        },
      },
    }
  }

  async function runOnce(
    output: SandboxCommandOutput,
    onOutputDir?: (dir: string) => Promise<void>,
  ): Promise<{ result: ExecutionResult; argvs: string[][] }> {
    const { runner, argvs } = fakeRunner(output, onOutputDir)
    const provider = new CloudRunSandboxProvider({ commandRunner: runner })
    const service = new CodeInterpreterService({ provider })
    const task = await service.submit({ language: 'python', code: 'print(1)' })
    const result = await settle(service, task.taskId)
    return { result, argvs }
  }

  it('builds a `sandbox do` argv that mounts code/input read-only and never allows egress', async () => {
    const { result, argvs } = await runOnce(
      { exitCode: 0, stdout: 'hello\n__KQ_EXIT__0\n', stderr: '' },
      async (dir) => {
        await writeFile(join(dir, 'out.csv'), 'a,b', 'utf8')
      },
    )

    const argv = argvs[0] ?? []
    expect(argv[0]).toBe('/usr/local/gcp/bin/sandbox')
    expect(argv[1]).toBe('do')
    // 禁网就是「不传这个 flag」——官方默认阻断全部出站。
    expect(argv).not.toContain('--allow-egress')
    expect(argv.some((value) => value.includes('destination=/mnt/code,readonly'))).toBe(true)
    expect(argv.some((value) => value.includes('destination=/mnt/in,readonly'))).toBe(true)
    expect(argv.some((value) => value === 'OUTPUT_DIR=/mnt/out')).toBe(true)
    expect(argv.some((value) => value.startsWith('MPLCONFIGDIR='))).toBe(true)
    // 沙箱不继承宿主环境变量，且官方明确警告不要用 --env 传密钥：这里不得出现凭证。
    expect(argv.some((value) => /token|secret|key=/i.test(value))).toBe(false)

    expect(result.status).toBe('succeeded')
    // 哨兵行必须从 stdout 中移除，不能泄漏给用户。
    expect(result.stdout).not.toContain('__KQ_EXIT__')
    expect(result.stdout.trim()).toBe('hello')
    expect(result.artifacts).toEqual([
      { name: 'out.csv', mimeType: 'text/csv', sizeBytes: 3, encoding: 'utf8', content: 'a,b' },
    ])
  })

  it('maps the sentinel exit code onto the shared state machine', async () => {
    const failed = await runOnce({ exitCode: 0, stdout: '__KQ_EXIT__3\n', stderr: 'boom\n' })
    expect(failed.result.status).toBe('failed')
    expect(failed.result.exitCode).toBe(3)

    // 沙箱内看门狗的约定退出码 124 → timed_out（平台给不了超时终态，design.md §3.1）。
    const timedOut = await runOnce({ exitCode: 0, stdout: `__KQ_EXIT__${124}\n`, stderr: '' })
    expect(timedOut.result.status).toBe('timed_out')
  })

  it('settles as cancelled when cancel() wins, regardless of what the CLI reports', async () => {
    let release: (() => void) | undefined
    const runner: SandboxCommandRunner = {
      async run(_argv, options) {
        await new Promise<void>((resolve) => {
          release = resolve
          options.signal.addEventListener('abort', () => resolve(), { once: true })
        })
        return { exitCode: 0, stdout: '__KQ_EXIT__0\n', stderr: '' }
      },
    }
    const service = new CodeInterpreterService({
      provider: new CloudRunSandboxProvider({ commandRunner: runner }),
    })
    const task = await service.submit({ language: 'python', code: 'print(1)' })
    await service.cancel(task.taskId)
    release?.()
    const result = await settle(service, task.taskId)
    // 意图先行：谁先发起就记谁，平台/CLI 报什么都不参与判定。
    expect(result.status).toBe('cancelled')
  })

  // CLI 输出格式官方**无稳定性承诺**，解析层集中在 parseSandboxDoOutput 一处，必须只容错不抛错。
  describe('parseSandboxDoOutput tolerates malformed CLI output', () => {
    it('prefers the in-sandbox sentinel and strips it from stdout', () => {
      const parsed = parseSandboxDoOutput({ exitCode: 0, stdout: 'a\n__KQ_EXIT__7\n', stderr: '' })
      expect(parsed).toMatchObject({ exitCode: 7, exitCodeSource: 'sentinel' })
      expect(parsed.stdout).not.toContain('__KQ_EXIT__')
    })

    it('takes the last sentinel so user code cannot spoof an earlier one', () => {
      const parsed = parseSandboxDoOutput({
        exitCode: 0,
        stdout: '__KQ_EXIT__0\nmore\n__KQ_EXIT__5\n',
        stderr: '',
      })
      expect(parsed.exitCode).toBe(5)
      expect(parsed.stdout).toContain('__KQ_EXIT__0')
    })

    it('falls back to the CLI exit code when the sentinel is missing or unparsable', () => {
      expect(parseSandboxDoOutput({ exitCode: 2, stdout: 'noise', stderr: '' })).toMatchObject({
        exitCode: 2,
        exitCodeSource: 'cli',
      })
      expect(
        parseSandboxDoOutput({ exitCode: 2, stdout: '__KQ_EXIT__oops\n', stderr: '' }),
      ).toMatchObject({ exitCode: 2, exitCodeSource: 'cli' })
    })

    it('never throws on empty output, signal kills, or spawn failures', () => {
      expect(parseSandboxDoOutput({ exitCode: undefined, stdout: '', stderr: '' })).toMatchObject({
        exitCodeSource: 'unknown',
      })
      const spawned = parseSandboxDoOutput({
        exitCode: undefined,
        stdout: '',
        stderr: '',
        spawnError: 'ENOENT',
      })
      expect(spawned.exitCode).toBe(127)
      expect(spawned.stderr).toContain('ENOENT')
    })
  })
})

// Phase 6 —— 产物生命周期的**验证**而非实现。
// 当前架构是 ephemeral 的：工作目录 mkdtemp 建、执行结束即 rm -rf，产物随
// ExecutionResult inline 返回，不落任何持久化存储（design.md §6.3）。
// 因此没有需要 TTL 管理的持久化产物；本节要证明的是「清理真的发生」，
// 包括成功、失败、超时、取消四条路径——任何一条泄漏都是隐私问题。
describePython('sandbox working directory is destroyed on every path (Phase 6)', () => {
  /** 枚举本 Provider 遗留在 tmpdir 的工作目录；前缀为 LocalProvider 专用。 */
  async function listWorkDirs(): Promise<string[]> {
    const names = await readdir(tmpdir())
    return names.filter((name) => name.startsWith('kq-code-interpreter-')).sort()
  }

  /** 断言一次执行没有留下任何新的工作目录。 */
  async function expectNoLeak(run: () => Promise<ExecutionResult>): Promise<ExecutionResult> {
    const before = await listWorkDirs()
    const result = await run()
    const after = await listWorkDirs()
    expect(after.filter((name) => !before.includes(name))).toEqual([])
    return result
  }

  it('destroys the work directory after a successful run', async () => {
    const service = createService()
    const result = await expectNoLeak(async () => {
      const { taskId } = await service.submit({
        language: 'python',
        code: [
          'import os',
          'with open(os.path.join(os.environ["OUTPUT_DIR"], "a.csv"), "w") as h:',
          '    h.write("x")',
          'print(os.environ["OUTPUT_DIR"])',
        ].join('\n'),
        limits: { timeoutMs: 20_000 },
      })
      return await settle(service, taskId)
    })
    expect(result.status).toBe('succeeded')
    // 产物内容已随结果回传，而它的来源目录已经不存在——这正是 ephemeral 模型。
    expect(result.artifacts[0]?.content).toBe('x')
    expect(existsSync(result.stdout.trim())).toBe(false)
  })

  it('destroys the work directory after a failing run', async () => {
    const service = createService()
    const result = await expectNoLeak(async () => {
      const { taskId } = await service.submit({
        language: 'python',
        code: 'raise ValueError("boom")',
        limits: { timeoutMs: 20_000 },
      })
      return await settle(service, taskId)
    })
    expect(result.status).toBe('failed')
  })

  it('destroys the work directory after a timeout', async () => {
    const service = createService()
    const result = await expectNoLeak(async () => {
      const { taskId } = await service.submit({
        language: 'python',
        code: 'import time\ntime.sleep(60)',
        limits: { timeoutMs: 1500 },
      })
      return await settle(service, taskId, 15_000)
    })
    expect(result.status).toBe('timed_out')
  })

  it('destroys the work directory after a cancel, including files already written', async () => {
    const service = createService()
    const result = await expectNoLeak(async () => {
      const { taskId } = await service.submit({
        language: 'python',
        code: [
          'import os, time',
          'with open(os.path.join(os.environ["OUTPUT_DIR"], "secret.csv"), "w") as h:',
          '    h.write("sensitive")',
          'print("written", flush=True)',
          'time.sleep(60)',
        ].join('\n'),
        limits: { timeoutMs: 30_000 },
      })
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const pending = await service.get(taskId)
        if (pending.status === 'running') break
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      await service.cancel(taskId)
      return await settle(service, taskId, 15_000)
    })
    expect(result.status).toBe('cancelled')
  })
})

// AC3 —— Agent 集成测试：经由**注册的工具**驱动，CSV 输入，断言 stdout 与 PNG 产物。
//
// 沙箱脚本用 stdlib（zlib + struct）手写 PNG，而不是 matplotlib：本机无 numpy/pandas/
// matplotlib，且 AC3 真正要验的是**二进制产物通道能否无损回传**。matplotlib 出图已由
// fly 真机实测覆盖（fly-live-probe.md：chart.png 6973 字节 + magic 校验）。
describePython('code_interpreter agent integration: CSV in, stdout + PNG out (AC3)', () => {
  const PNG_MAGIC = '89504e470d0a1a0a'

  const SANDBOX_CODE = [
    'import csv, hashlib, os, struct, zlib',
    'with open(os.path.join(os.environ["INPUT_DIR"], "prices.csv"), newline="") as handle:',
    '    rows = list(csv.DictReader(handle))',
    'closes = [float(row["close"]) for row in rows]',
    'print("rows", len(rows))',
    'print("mean", round(sum(closes) / len(closes), 2))',
    'def chunk(tag, payload):',
    '    crc = zlib.crc32(tag + payload) & 0xFFFFFFFF',
    '    return struct.pack(">I", len(payload)) + tag + payload + struct.pack(">I", crc)',
    'width, height = len(closes), 1',
    'raw = b"\\x00" + b"".join(bytes((int(c) % 256, 0, 255 - int(c) % 256)) for c in closes)',
    'png = b"\\x89PNG\\r\\n\\x1a\\n"',
    'png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))',
    'png += chunk(b"IDAT", zlib.compress(raw, 9))',
    'png += chunk(b"IEND", b"")',
    'with open(os.path.join(os.environ["OUTPUT_DIR"], "chart.png"), "wb") as handle:',
    '    handle.write(png)',
    'print("png_bytes", len(png))',
    'print("png_sha256", hashlib.sha256(png).hexdigest())',
  ].join('\n')

  it('runs through getRegisteredChartTools() and returns a byte-identical PNG', async () => {
    const tool = getRegisteredChartTools().find(
      (candidate) => candidate.config.name === CODE_INTERPRETER_TOOL_NAME,
    )
    expect(tool).toBeDefined()

    const labels: string[] = []
    const result = (await tool?.execute(
      new CodeInterpreterTool(createService()),
      {
        code: SANDBOX_CODE,
        files: [
          {
            name: 'prices.csv',
            content: 'date,close\n2026-09-01,10\n2026-09-02,20\n2026-09-03,30\n',
          },
        ],
        timeoutMs: 30_000,
      },
      { signal: new AbortController().signal, progress: (update) => labels.push(update.label) },
    )) as ExecutionResult

    expect(result.status).toBe('succeeded')
    expect(result.exitCode).toBe(0)
    expect(labels).toContain('queued')

    // stdout：断言实际计算结果，不是「非空」。
    expect(result.stdout).toContain('rows 3')
    expect(result.stdout).toContain('mean 20.0')

    // PNG 产物：类型、magic、字节数、以及与沙箱内原始字节逐位一致。
    expect(result.artifacts).toHaveLength(1)
    const artifact = result.artifacts[0]
    expect(artifact?.name).toBe('chart.png')
    expect(artifact?.mimeType).toBe('image/png')
    expect(artifact?.encoding).toBe('base64')

    const decoded = Buffer.from(artifact?.content ?? '', 'base64')
    expect(decoded.subarray(0, 8).toString('hex')).toBe(PNG_MAGIC)
    expect(decoded.byteLength).toBe(artifact?.sizeBytes)

    const declaredBytes = Number(/png_bytes (\d+)/.exec(result.stdout)?.[1])
    const declaredSha = /png_sha256 ([0-9a-f]{64})/.exec(result.stdout)?.[1]
    expect(decoded.byteLength).toBe(declaredBytes)
    // base64 往返无损：回传到测试进程的字节与沙箱内写盘的字节完全相同。
    expect(createHash('sha256').update(decoded).digest('hex')).toBe(declaredSha)
  })
})
