/** 后端托管契约：复用外部服务、缺产物、拉起就绪、提前退出、超时与回收。 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  type ManagedProcess,
  type SpawnBackend,
  type SpawnBackendOptions,
  startManagedBackends,
} from './backends'

const PLATFORM = 'linux'
const ARCH = 'x64'
const GOTDX_HEALTH = 'http://127.0.0.1:8080/health/live'
const BINANCE_HEALTH = 'http://127.0.0.1:8091/health'

/** 可手动结束的替身进程，用来模拟后端提前退出与退出回收。 */
class FakeBackendProcess implements ManagedProcess {
  readonly stdout = null
  readonly stderr = null
  killed = false
  private readonly listeners: Array<(code: number | null, signal: NodeJS.Signals | null) => void> =
    []

  on(_event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this {
    this.listeners.push(listener)
    return this
  }

  kill(): boolean {
    this.killed = true
    this.exit(0)
    return true
  }

  exit(code: number | null): void {
    for (const listener of [...this.listeners]) listener(code, null)
  }
}

interface HarnessOptions {
  /** 是否在资源目录里铺好两个可执行文件。 */
  readonly binaries?: boolean
  /** 健康探测结果；函数形式可按地址区分。 */
  readonly healthy?: boolean | ((url: string) => boolean)
  readonly readyTimeoutMs?: number
  readonly pollIntervalMs?: number
  readonly onSpawn?: (process: FakeBackendProcess, options: SpawnBackendOptions) => void
}

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** 铺一个临时的资源目录 + userData，并记录 spawn 调用。 */
function createHarness(options: HarnessOptions = {}) {
  const root = mkdtempSync(join(tmpdir(), 'kline-backends-'))
  roots.push(root)
  const resourceRoot = join(root, 'resources')
  const dataRoot = join(root, 'userData')
  const binaryDirectory = join(resourceRoot, 'backends', `${PLATFORM}-${ARCH}`)
  mkdirSync(binaryDirectory, { recursive: true })
  if (options.binaries !== false) {
    writeFileSync(join(binaryDirectory, 'gotdx'), '')
    writeFileSync(join(binaryDirectory, 'binance'), '')
  }

  const spawned: Array<{
    command: string
    options: SpawnBackendOptions
    process: FakeBackendProcess
  }> = []
  const spawnBackend: SpawnBackend = (command, _args, spawnOptions) => {
    const process = new FakeBackendProcess()
    spawned.push({ command, options: spawnOptions, process })
    options.onSpawn?.(process, spawnOptions)
    return process
  }
  const healthy = options.healthy ?? false
  const probe = async (url: string) => (typeof healthy === 'function' ? healthy(url) : healthy)

  return {
    root,
    spawned,
    options: {
      resourceRoot,
      dataRoot,
      platform: PLATFORM as NodeJS.Platform,
      arch: ARCH,
      spawnBackend,
      probe,
      readyTimeoutMs: options.readyTimeoutMs,
      pollIntervalMs: options.pollIntervalMs,
    },
  }
}

describe('startManagedBackends', () => {
  it('端口上已有同款服务时复用，不重复拉起也不负责回收', async () => {
    const harness = createHarness({ healthy: true })

    const host = startManagedBackends(harness.options)
    await host.ready

    expect(host.statuses()).toEqual([
      { id: 'gotdx', state: 'reused' },
      { id: 'binance', state: 'reused' },
    ])
    expect(harness.spawned).toHaveLength(0)
    await host.dispose()
    expect(harness.spawned).toHaveLength(0)
  })

  it('缺少打包产物时记为 missing，不启动进程', async () => {
    const harness = createHarness({ binaries: false })

    const host = startManagedBackends(harness.options)
    await host.ready

    expect(host.statuses().map((status) => status.state)).toEqual(['missing', 'missing'])
    expect(host.statuses()[0]?.detail).toContain(join('backends', `${PLATFORM}-${ARCH}`, 'gotdx'))
    expect(harness.spawned).toHaveLength(0)
    await host.dispose()
  })

  it('拉起后端并把数据目录指到 userData', async () => {
    const probed: string[] = []
    const harness = createHarness({
      healthy: (url) => {
        probed.push(url)
        // 第一次是复用探测，第二次是启动后的就绪探测。
        return probed.filter((item) => item === url).length > 1
      },
      pollIntervalMs: 5,
      readyTimeoutMs: 1_000,
    })

    const host = startManagedBackends(harness.options)
    await host.ready

    expect(probed).toContain(GOTDX_HEALTH)
    expect(probed).toContain(BINANCE_HEALTH)
    expect(host.statuses()).toEqual([
      { id: 'gotdx', state: 'running' },
      { id: 'binance', state: 'running' },
    ])
    const gotdx = harness.spawned.find((item) => item.command.endsWith('gotdx'))
    expect(gotdx?.options.cwd).toBe(join(harness.options.dataRoot, 'gotdx'))
    expect(gotdx?.options.env.SYMBOL_DB_PATH).toBe(
      join(harness.options.dataRoot, 'gotdx', 'data', 'tdx-symbols.db'),
    )
    const binance = harness.spawned.find((item) => item.command.endsWith('binance'))
    expect(binance?.options.env.BINANCE_CACHE_DIR).toBe(
      join(harness.options.dataRoot, 'binance', 'archives'),
    )

    await host.dispose()
  })

  it('进程在就绪前退出时立刻收敛，不耗满超时', async () => {
    const harness = createHarness({
      readyTimeoutMs: 5_000,
      pollIntervalMs: 5,
      onSpawn: (process) => {
        setTimeout(() => process.exit(1), 10)
      },
    })

    const started = Date.now()
    const host = startManagedBackends(harness.options)
    await host.ready

    expect(Date.now() - started).toBeLessThan(2_000)
    expect(host.statuses().map((status) => status.state)).toEqual(['failed', 'failed'])
    expect(host.statuses()[0]?.detail).toContain('exited')
    await host.dispose()
  })

  it('就绪超时只标记失败，进程保留到退出时回收', async () => {
    const harness = createHarness({ readyTimeoutMs: 60, pollIntervalMs: 10 })

    const host = startManagedBackends(harness.options)
    await host.ready

    expect(host.statuses().map((status) => status.state)).toEqual(['failed', 'failed'])
    expect(host.statuses()[0]?.detail).toContain('timed out')
    expect(harness.spawned.every((item) => !item.process.killed)).toBe(true)

    await host.dispose()
    expect(harness.spawned.every((item) => item.process.killed)).toBe(true)
  })
})
