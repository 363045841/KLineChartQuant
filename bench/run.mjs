/**
 * 无头 Chrome 渲染基准运行器。
 * 使用本机 Chrome 与 CDP，不下载浏览器；运行结束删除临时 profile 并关闭测试服务。
 */

import { execFile, spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const benchDir = dirname(fileURLToPath(import.meta.url))
const repoDir = resolve(benchDir, '..')

/** 多轮样本合并后统一汇总：百分位基于全部帧，单轮整段抖动不会决定结果。 */
function poolRounds(rounds, refreshIntervalMs) {
  const first = rounds[0]
  const utilization = rounds
    .map((round) => round.resource.mainThreadUtilization)
    .filter((value) => Number.isFinite(value))
  return summarize(
    {
      ...first.result,
      cpuFramePreparationMs: rounds.flatMap((round) => round.result.cpuFramePreparationMs),
      cpuFrameMs: rounds.flatMap((round) => round.result.cpuFrameMs),
      frameIntervalsMs: rounds.flatMap((round) => round.result.frameIntervalsMs),
      gpuFrameMs: rounds.flatMap((round) => round.result.gpuFrameMs),
    },
    {
      gpuSamples: rounds.flatMap((round) => round.resource.gpuSamples),
      mainThreadUtilization: utilization.length
        ? utilization.reduce((sum, value) => sum + value, 0) / utilization.length
        : null,
    },
    refreshIntervalMs,
  )
}

/** 读取 --name=value 形式的命令行参数；用于单点重跑，不必一次跑完全部组合。 */
function argument(name) {
  const prefix = `--${name}=`
  const match = process.argv.find((value) => value.startsWith(prefix))
  return match ? match.slice(prefix.length) : undefined
}

const csv = (value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

const chromePath =
  process.env.KLINE_BENCH_CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const vitePath = resolve(repoDir, 'node_modules', 'vite', 'bin', 'vite.js')
const port = Number(process.env.KLINE_BENCH_PORT ?? 4173)
const remoteDebugPort = Number(process.env.KLINE_BENCH_DEBUG_PORT ?? 9223)
const visibleBarSets = csv(argument('bars') ?? process.env.KLINE_BENCH_BARS ?? '300,600,1200,2000,3000,5000,7000,10000')
  .map(Number)
  .filter((value) => Number.isFinite(value) && value > 0)
const backendSets = csv(argument('backends') ?? process.env.KLINE_BENCH_BACKENDS ?? 'canvas2d,webgl2,webgpu')
const profileSets = csv(
  argument('profiles') ?? process.env.KLINE_BENCH_PROFILES ?? 'lines3,lines12,ichimoku',
)
const warmupFrames = Number(process.env.KLINE_BENCH_WARMUP ?? 60)
const sampleFrames = Number(process.env.KLINE_BENCH_FRAMES ?? 300)
// 同一场景重复测量并取中位数；系统占用会让某一轮整体偏慢，单轮容易画出假拐点。
const rounds = Math.max(
  1,
  Math.round(Number(argument('rounds') ?? process.env.KLINE_BENCH_ROUNDS ?? 1)) || 1,
)
const width = Number(process.env.KLINE_BENCH_WIDTH ?? 1180)
const height = Number(process.env.KLINE_BENCH_HEIGHT ?? 640)
const dpr = Number(process.env.KLINE_BENCH_DPR ?? 2)
const droppedFrameMultiplier = 1.5
const severeJankMultiplier = 2

/** 等待条件成立，超时后抛出带上下文的错误。 */
async function waitFor(check, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      const value = await check()
      if (value) return value
    } catch (error) {
      lastError = error
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100))
  }
  throw new Error(`${label} timed out${lastError ? `: ${lastError.message}` : ''}`)
}

/** 建立最小 CDP 客户端，支持浏览器级和页面级命令。 */
function createCdpClient(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl)
  let sequence = 0
  const pending = new Map()

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (!message.id) return
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    if (message.error) request.reject(new Error(message.error.message))
    else request.resolve(message.result)
  })

  return {
    async ready() {
      if (socket.readyState === WebSocket.OPEN) return
      await new Promise((resolveOpen, rejectOpen) => {
        socket.addEventListener('open', resolveOpen, { once: true })
        socket.addEventListener('error', rejectOpen, { once: true })
      })
    },
    send(method, params = {}) {
      sequence += 1
      const id = sequence
      return new Promise((resolveRequest, rejectRequest) => {
        pending.set(id, { resolve: resolveRequest, reject: rejectRequest })
        socket.send(JSON.stringify({ id, method, params }))
      })
    },
    close() {
      socket.close()
    },
  }
}

/** 等待子进程退出；超时后由调用方决定是否强制终止。 */
async function waitForExit(child, timeoutMs = 5_000) {
  if (!child || child.exitCode !== null) return true
  return Promise.race([
    new Promise((resolveExit) => child.once('exit', () => resolveExit(true))),
    new Promise((resolveTimeout) => setTimeout(() => resolveTimeout(false), timeoutMs)),
  ])
}

/** 执行页面表达式，并把异常转换为 Node 错误。 */
async function evaluate(page, expression, awaitPromise = true) {
  const response = await page.send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
  })
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description ?? 'Page evaluation failed')
  }
  return response.result.value
}

/** 读取 CDP Performance 指标并按名称组织。 */
async function performanceMetrics(page) {
  const response = await page.send('Performance.getMetrics')
  return Object.fromEntries(response.metrics.map((metric) => [metric.name, metric.value]))
}

/** 读取可选的 NVIDIA 设备清单；非 NVIDIA 环境不应因此中止基准。 */
async function readNvidiaInventory() {
  try {
    const { stdout } = await execFileAsync('nvidia-smi', [
      '--query-gpu=name,driver_version,memory.total',
      '--format=csv,noheader',
    ])
    return stdout.trim() || null
  } catch {
    return null
  }
}

/** 在场景运行期间用 Windows GPU Engine 计数器采样实际 Chrome 进程。 */
function beginGpuSampling(processIds) {
  const samples = []
  const ids = processIds.filter((value) => Number.isInteger(value) && value > 0)
  if (ids.length === 0) {
    return {
      between: () => [],
      stop: async () => {},
    }
  }
  const powershellScript = [
    "$ErrorActionPreference='SilentlyContinue'",
    `$ids=@(${ids.join(',')})`,
    "$pattern='pid_('+(($ids|ForEach-Object{[regex]::Escape([string]$_)})-join '|')+')_'",
    "Get-Counter '\\GPU Engine(*)\\Utilization Percentage','\\GPU Process Memory(*)\\Dedicated Usage','\\GPU Process Memory(*)\\Shared Usage' -SampleInterval 1 -Continuous|ForEach-Object{",
    '$c=$_.CounterSamples',
    "$e=@($c|Where-Object{$_.Path -match $pattern -and $_.Path -like '*utilization percentage'})",
    "$m=@($c|Where-Object{$_.Path -match $pattern -and ($_.Path -like '*dedicated usage' -or $_.Path -like '*shared usage')})",
    '$u=if($e.Count){($e.CookedValue|Measure-Object -Maximum).Maximum}else{0}',
    '$b=if($m.Count){($m.CookedValue|Measure-Object -Sum).Sum}else{0}',
    '[Console]::Out.WriteLine(([pscustomobject]@{at=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();utilization=[double]$u;memoryMiB=[double]$b/1MB}|ConvertTo-Json -Compress))',
    '}',
  ].join(';')
  const sampler = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', powershellScript],
    { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true },
  )
  let buffered = ''
  sampler.stdout.setEncoding('utf8')
  sampler.stdout.on('data', (chunk) => {
    buffered += chunk
    const lines = buffered.split(/\r?\n/)
    buffered = lines.pop() ?? ''
    for (const line of lines) {
      try {
        const sample = JSON.parse(line)
        if (Number.isFinite(sample.utilization) && Number.isFinite(sample.memoryMiB)) {
          samples.push({ ...sample, powerW: null })
        }
      } catch {
        // 忽略 PowerShell 的非 JSON 诊断行。
      }
    }
  })
  sampler.on('error', () => {})
  return {
    between(startedAt, endedAt) {
      return samples.filter((sample) => sample.at >= startedAt && sample.at <= endedAt)
    },
    async stop() {
      sampler.kill()
      await waitForExit(sampler, 2_000)
    },
  }
}

/** 计算分位数，输入会复制排序。 */
function percentile(values, quantile) {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const index = (sorted.length - 1) * quantile
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower)
}

/** 计算样本标准差，用于衡量连续帧间隔的离散程度。 */
function standardDeviation(values) {
  if (values.length < 2) return null
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

/** 统计超过帧预算的最长连续卡顿段。 */
function longestStreak(values, predicate) {
  let longest = 0
  let current = 0
  for (const value of values) {
    if (predicate(value)) {
      current += 1
      longest = Math.max(longest, current)
    } else {
      current = 0
    }
  }
  return longest
}

/** 汇总单个场景的数组指标。 */
function summarize(result, resource, refreshIntervalMs) {
  const intervals = result.frameIntervalsMs
  const meanInterval = intervals.length
    ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length
    : null
  const gpuUtilization = resource.gpuSamples.map((sample) => sample.utilization)
  const gpuMemory = resource.gpuSamples.map((sample) => sample.memoryMiB)
  const power = resource.gpuSamples
    .map((sample) => sample.powerW)
    .filter((value) => Number.isFinite(value))
  const framePacingJitter = intervals.map((value) => Math.abs(value - refreshIntervalMs))
  const droppedFrame = (value) => value > refreshIntervalMs * droppedFrameMultiplier
  const frameIntervalP99Ms = percentile(intervals, 0.99)
  return {
    ...result,
    summary: {
      cpuFramePreparationP50Ms: percentile(result.cpuFramePreparationMs, 0.5),
      cpuFramePreparationP95Ms: percentile(result.cpuFramePreparationMs, 0.95),
      cpuFrameP50Ms: percentile(result.cpuFrameMs, 0.5),
      cpuFrameP95Ms: percentile(result.cpuFrameMs, 0.95),
      gpuFrameP50Ms: percentile(result.gpuFrameMs, 0.5),
      gpuFrameP95Ms: percentile(result.gpuFrameMs, 0.95),
      frameIntervalP50Ms: percentile(intervals, 0.5),
      frameIntervalP95Ms: percentile(intervals, 0.95),
      frameIntervalP99Ms,
      frameIntervalStdDevMs: standardDeviation(intervals),
      framePacingJitterP95Ms: percentile(framePacingJitter, 0.95),
      observedFps: meanInterval ? 1000 / meanInterval : null,
      onePercentLowFps: frameIntervalP99Ms ? 1000 / frameIntervalP99Ms : null,
      droppedFrameRate: intervals.length
        ? intervals.filter(droppedFrame).length / intervals.length
        : null,
      severeJankRate: intervals.length
        ? intervals.filter((value) => value > refreshIntervalMs * severeJankMultiplier).length /
          intervals.length
        : null,
      longestDroppedFrameStreak: longestStreak(intervals, droppedFrame),
      rendererMainThreadUtilization: resource.mainThreadUtilization,
      gpuUtilizationAverage: gpuUtilization.length
        ? gpuUtilization.reduce((sum, value) => sum + value, 0) / gpuUtilization.length
        : null,
      gpuUtilizationP95: percentile(gpuUtilization, 0.95),
      gpuMemoryAverageMiB: gpuMemory.length
        ? gpuMemory.reduce((sum, value) => sum + value, 0) / gpuMemory.length
        : null,
      gpuMemoryMaxMiB: gpuMemory.length ? Math.max(...gpuMemory) : null,
      gpuPowerAverageW: power.length
        ? power.reduce((sum, value) => sum + value, 0) / power.length
        : null,
    },
  }
}

/** 将关键汇总指标同步输出为便于论文使用的 CSV。 */
function toCsv(results) {
  const columns = [
    'backend',
    'effectiveBackend',
    'lineProfile',
    'visibleBars',
    'cpuFramePreparationP50Ms',
    'cpuFramePreparationP95Ms',
    'initializationMs',
    'cpuFrameP50Ms',
    'cpuFrameP95Ms',
    'gpuFrameP50Ms',
    'gpuFrameP95Ms',
    'frameIntervalP50Ms',
    'frameIntervalP95Ms',
    'frameIntervalP99Ms',
    'frameIntervalStdDevMs',
    'framePacingJitterP95Ms',
    'observedFps',
    'onePercentLowFps',
    'droppedFrameRate',
    'severeJankRate',
    'longestDroppedFrameStreak',
    'rendererMainThreadUtilization',
    'gpuUtilizationAverage',
    'gpuUtilizationP95',
    'gpuMemoryAverageMiB',
    'gpuMemoryMaxMiB',
    'drawCallsPerFrame',
    'queueSubmitsPerFrame',
    'uploadsPerFrame',
    'uploadedBytesPerFrame',
  ]
  const rows = results.map((result) =>
    columns
      .map((column) => {
        const value = column in result ? result[column] : result.summary[column]
        return value ?? ''
      })
      .join(','),
  )
  return `${columns.join(',')}\n${rows.join('\n')}\n`
}

/** 运行完整矩阵并保证所有临时进程与目录被清理。 */
/** 输出阶段日志；长等待期间用户必须知道当前卡在哪一步。 */
function logPhase(message) {
  process.stderr.write(`[bench] ${message}\n`)
}

/** 等待期间每秒打一个点，避免单场景跑十几秒时界面完全静默。 */
function heartbeat() {
  const timer = setInterval(() => process.stderr.write('.'), 1000)
  return () => clearInterval(timer)
}

/** 在页面里跑一个场景；执行期间持续打点，长场景也不会看起来卡死。 */
async function runPageScenario(page, options) {
  const stopHeartbeat = heartbeat()
  try {
    return await evaluate(page, `window.renderBench.runScenario(${JSON.stringify(options)})`)
  } finally {
    stopHeartbeat()
  }
}

async function main() {
  const profileDir = await mkdtemp(resolve(tmpdir(), 'kline-render-bench-'))
  logPhase('starting Vite dev server…')
  const vite = spawn(
    process.execPath,
    [vitePath, '--config', resolve(benchDir, 'vite.config.ts')],
    {
      cwd: repoDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  )
  let chrome
  let browser
  let page
  let gpuSampler

  try {
    await waitFor(
      async () => {
        const response = await fetch(`http://127.0.0.1:${port}/`)
        return response.ok
      },
      20_000,
      'Vite server',
    )
    logPhase('launching headless Chrome…')

    const chromeArgs = [
      '--headless=new',
      '--enable-gpu',
      '--force_high_performance_gpu',
      '--enable-unsafe-webgpu',
      '--ignore-gpu-blocklist',
      '--disable-software-rasterizer',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--enable-precise-memory-info',
      `--remote-debugging-port=${remoteDebugPort}`,
      `--user-data-dir=${profileDir}`,
      `--window-size=${width},${height}`,
      `--force-device-scale-factor=${dpr}`,
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ]
    chrome = spawn(chromePath, chromeArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    const version = await waitFor(
      async () => {
        const response = await fetch(`http://127.0.0.1:${remoteDebugPort}/json/version`)
        return response.ok ? response.json() : null
      },
      20_000,
      'Chrome DevTools',
    )
    browser = createCdpClient(version.webSocketDebuggerUrl)
    await browser.ready()

    const target = await fetch(
      `http://127.0.0.1:${remoteDebugPort}/json/new?${encodeURIComponent(`http://127.0.0.1:${port}/`)}`,
      { method: 'PUT' },
    ).then((response) => response.json())
    page = createCdpClient(target.webSocketDebuggerUrl)
    await page.ready()
    await page.send('Runtime.enable')
    await page.send('Performance.enable')
    await waitFor(
      () => evaluate(page, "document.body.dataset.ready === 'true'"),
      20_000,
      'benchmark page',
    )
    logPhase('checking GPU identity…')

    const systemInfo = await browser.send('SystemInfo.getInfo')
    const browserVersion = await browser.send('Browser.getVersion')
    const pageGpu = await evaluate(page, 'window.renderBench.inspectGpu()')
    const identityText = JSON.stringify({ systemInfo, pageGpu }).toLowerCase()
    if (/swiftshader|llvmpipe|software only/.test(identityText)) {
      throw new Error('Software GPU backend detected; benchmark rejected')
    }
    if (!pageGpu.webgpuAvailable || !pageGpu.webglRenderer) {
      throw new Error('Hardware WebGL/WebGPU unavailable in headless Chrome')
    }

    const processInfo = await browser.send('SystemInfo.getProcessInfo')
    const chromeProcessIds = processInfo.processInfo.map((process) => Number(process.id))
    gpuSampler = beginGpuSampling(chromeProcessIds)
    logPhase('calibrating refresh interval…')
    const refreshIntervals = await evaluate(page, 'window.renderBench.measureRefreshIntervals(180)')
    const refreshIntervalMs = percentile(refreshIntervals, 0.5)
    if (!refreshIntervalMs || refreshIntervalMs <= 0) {
      throw new Error('Unable to calibrate requestAnimationFrame refresh interval')
    }
    const scenarios = []
    const optionsByKey = new Map()
    const backends = backendSets
    const profiles = profileSets
    const totalScenarios = backends.length * visibleBarSets.length * profiles.length
    process.stderr.write(
      `Plan: ${totalScenarios} scenarios (${backends.join('/')} × ${visibleBarSets.join('/')} bars × ${profiles.join('/')}), ` +
        `refresh ${(1000 / refreshIntervalMs).toFixed(0)} Hz` +
        `${rounds > 1 ? `, ${rounds} rounds (pooled)` : ''}\n`,
    )
    let scenarioIndex = 0
    for (const backend of backends) {
      for (const visibleBars of visibleBarSets) {
        for (const lineProfile of profiles) {
          scenarioIndex += 1
          const sampleBudget =
            visibleBars >= 2000 ? Math.min(sampleFrames, 120) : sampleFrames
          const options = {
            backend,
            lineProfile,
            visibleBars,
            width,
            height,
            dpr,
            warmupFrames,
            sampleFrames: sampleBudget,
          }
          optionsByKey.set(`${backend}|${lineProfile}|${visibleBars}`, options)
          const measured = []
          for (let round = 1; round <= rounds; round += 1) {
            process.stderr.write(
              `[${scenarioIndex}/${totalScenarios}]` +
                (rounds > 1 ? ` r${round}/${rounds}` : '') +
                ` ${lineProfile} ${backend} ${visibleBars}b … `,
            )
            const before = await performanceMetrics(page)
            const resourceStartedAt = Date.now()
            const startedAt = performance.now()
            const result = await runPageScenario(page, options)
            const resourceEndedAt = Date.now()
            const gpuSamples = gpuSampler.between(resourceStartedAt, resourceEndedAt)
            const elapsedSeconds = (performance.now() - startedAt) / 1000
            const after = await performanceMetrics(page)
            const taskDuration = Math.max(0, (after.TaskDuration ?? 0) - (before.TaskDuration ?? 0))
            const mainThreadUtilization =
              elapsedSeconds > 0 ? (taskDuration / elapsedSeconds) * 100 : null
            const row = summarize(result, { gpuSamples, mainThreadUtilization }, refreshIntervalMs)
            measured.push({ result, resource: { gpuSamples, mainThreadUtilization } })
            const summary = row.summary
            const severeJankRate =
              summary.severeJankRate === null
                ? 'N/A'
                : `${(summary.severeJankRate * 100).toFixed(2)}%`
            process.stderr.write(
              `done in ${elapsedSeconds.toFixed(1)}s | ` +
                `prepare ${summary.cpuFramePreparationP50Ms?.toFixed(3)}ms, ` +
                `paint ${summary.cpuFrameP50Ms?.toFixed(3)}ms, ` +
                `FPS ${summary.observedFps?.toFixed(1)}, ` +
                `1% low ${summary.onePercentLowFps?.toFixed(1)}, ` +
                `P99 ${summary.frameIntervalP99Ms?.toFixed(2)}ms, jank ${severeJankRate}\n`,
            )
          }
          scenarios.push(poolRounds(measured, refreshIntervalMs))
        }
      }
    }

    // 单轮中明显高于两侧 bar 的点通常来自整机占用，不是几何成本；补测后取中位数。
    // 多轮已经摊平抖动，只有单轮时才需要补测异常点。
    const retries = rounds === 1 ? Math.max(0, Number(process.env.KLINE_BENCH_RETRIES ?? 2)) : 0
    const groups = new Map()
    for (const scenario of scenarios) {
      const key = `${scenario.backend}|${scenario.lineProfile}`
      const series = groups.get(key) ?? []
      series.push(scenario)
      groups.set(key, series)
    }
    for (const series of groups.values()) {
      series.sort((a, b) => a.visibleBars - b.visibleBars)
      for (let index = 1; index < series.length - 1; index += 1) {
        const current = series[index]
        const p50 = current.summary.cpuFrameP50Ms
        const left = series[index - 1].summary.cpuFrameP50Ms
        const right = series[index + 1].summary.cpuFrameP50Ms
        if (p50 == null || left == null || right == null) continue
        const neighbor = Math.max(left, right)
        if (p50 <= neighbor * 1.35 || p50 - neighbor < 0.4) continue
        const options = optionsByKey.get(
          `${current.backend}|${current.lineProfile}|${current.visibleBars}`,
        )
        if (!options || retries === 0) continue
        const measured = [current]
        for (let attempt = 1; attempt <= retries; attempt += 1) {
          process.stderr.write(
            `[stabilize] ${current.lineProfile} ${current.backend} ${current.visibleBars}b ` +
              `r${attempt}/${retries} … `,
          )
          const before = await performanceMetrics(page)
          const resourceStartedAt = Date.now()
          const startedAt = performance.now()
          const result = await runPageScenario(page, options)
          const gpuSamples = gpuSampler.between(resourceStartedAt, Date.now())
          const elapsedSeconds = (performance.now() - startedAt) / 1000
          const after = await performanceMetrics(page)
          const taskDuration = Math.max(0, (after.TaskDuration ?? 0) - (before.TaskDuration ?? 0))
          measured.push(
            summarize(
              result,
              {
                gpuSamples,
                mainThreadUtilization:
                  elapsedSeconds > 0 ? (taskDuration / elapsedSeconds) * 100 : null,
              },
              refreshIntervalMs,
            ),
          )
          process.stderr.write(
            `done in ${elapsedSeconds.toFixed(1)}s | paint ` +
              `${measured.at(-1).summary.cpuFrameP50Ms?.toFixed(3)}ms\n`,
          )
        }
        const sorted = [...measured].sort(
          (a, b) => (a.summary.cpuFrameP50Ms ?? Infinity) - (b.summary.cpuFrameP50Ms ?? Infinity),
        )
        Object.assign(current, sorted[Math.floor(sorted.length / 2)])
      }
    }

    const nvidiaInventory = await readNvidiaInventory()
    const report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      git: {
        branch: (
          await execFileAsync('git', ['branch', '--show-current'], { cwd: repoDir })
        ).stdout.trim(),
        commit: (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoDir })).stdout.trim(),
      },
      environment: {
        os: `${process.platform} ${process.arch}`,
        node: process.version,
        chromeExecutable: chromePath,
        browserVersion,
        nvidiaInventory,
        cdpGpu: systemInfo.gpu,
        pageGpu,
        chromeArgs,
      },
      configuration: {
        visibleBars: visibleBarSets,
        warmupFrames,
        sampleFrames,
        rounds,
        outlierRetries: retries,
        width,
        height,
        dpr,
        refreshIntervalMs,
        nominalRefreshRateHz: 1000 / refreshIntervalMs,
        lineProfiles: { lines3: 3, lines12: 12, ichimoku: 5 },
        panes: 1,
        webgpuMsaa: 4,
      },
      scenarios,
    }
    // 单点重跑时与已有结果合并：按 backend/profile/bars 覆盖本次测过的行，其余保留。
    const resultsDir = resolve(benchDir, 'results')
    const jsonPath = resolve(resultsDir, 'render-bench-local.json')
    let previous = null
    try {
      previous = JSON.parse(await readFile(jsonPath, 'utf8'))
    } catch {
      previous = null
    }
    const keyOf = (row) => `${row.backend}|${row.lineProfile}|${row.visibleBars}`
    const merged = new Map()
    for (const row of previous?.scenarios ?? []) merged.set(keyOf(row), row)
    const reused = merged.size
    for (const row of scenarios) merged.set(keyOf(row), row)
    const mergedScenarios = [...merged.values()].sort(
      (a, b) =>
        a.visibleBars - b.visibleBars ||
        a.lineProfile.localeCompare(b.lineProfile) ||
        a.backend.localeCompare(b.backend),
    )
    report.scenarios = mergedScenarios
    report.configuration.mergedFromPrevious = reused
    process.stderr.write(
      `Merged ${scenarios.length} measured scenarios with ${reused} existing rows (${mergedScenarios.length} total)\n`,
    )

    await mkdir(resultsDir, { recursive: true })
    await writeFile(
      jsonPath,
      `${JSON.stringify(report, null, 2)}\n`,
    )
    await writeFile(resolve(resultsDir, 'render-bench-local.csv'), toCsv(mergedScenarios))
    process.stdout.write(`Results: ${jsonPath}\n`)
  } finally {
    await gpuSampler?.stop()
    page?.close()
    try {
      await browser?.send('Browser.close')
    } catch {
      chrome?.kill()
    }
    browser?.close()
    if (!(await waitForExit(chrome))) chrome?.kill()
    vite.kill()
    await waitForExit(vite)
    await rm(profileDir, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 200,
    })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
