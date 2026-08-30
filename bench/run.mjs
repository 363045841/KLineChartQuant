/**
 * 无头 Chrome 渲染基准运行器。
 * 使用本机 Chrome 与 CDP，不下载浏览器；运行结束删除临时 profile 并关闭测试服务。
 */

import { execFile, spawn } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const benchDir = dirname(fileURLToPath(import.meta.url))
const repoDir = resolve(benchDir, '..')
const chromePath =
  process.env.KLINE_BENCH_CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const vitePath = resolve(repoDir, 'node_modules', 'vite', 'bin', 'vite.js')
const port = Number(process.env.KLINE_BENCH_PORT ?? 4173)
const remoteDebugPort = Number(process.env.KLINE_BENCH_DEBUG_PORT ?? 9223)
const visiblePointSets = (process.env.KLINE_BENCH_POINTS ?? '1000,5000,10000')
  .split(',')
  .map(Number)
  .filter((value) => Number.isFinite(value) && value > 0)
const warmupFrames = Number(process.env.KLINE_BENCH_WARMUP ?? 120)
const sampleFrames = Number(process.env.KLINE_BENCH_FRAMES ?? 600)
const width = Number(process.env.KLINE_BENCH_WIDTH ?? 1180)
const height = Number(process.env.KLINE_BENCH_HEIGHT ?? 640)
const dpr = Number(process.env.KLINE_BENCH_DPR ?? 2)

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
  return {
    ...result,
    summary: {
      cpuFrameP50Ms: percentile(result.cpuFrameMs, 0.5),
      cpuFrameP95Ms: percentile(result.cpuFrameMs, 0.95),
      gpuFrameP50Ms: percentile(result.gpuFrameMs, 0.5),
      gpuFrameP95Ms: percentile(result.gpuFrameMs, 0.95),
      frameIntervalP50Ms: percentile(intervals, 0.5),
      frameIntervalP95Ms: percentile(intervals, 0.95),
      observedFps: meanInterval ? 1000 / meanInterval : null,
      droppedFrameRate: intervals.length
        ? intervals.filter((value) => value > refreshIntervalMs * 1.5).length / intervals.length
        : null,
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
    'visiblePoints',
    'geometryMs',
    'initializationMs',
    'cpuFrameP50Ms',
    'cpuFrameP95Ms',
    'gpuFrameP50Ms',
    'gpuFrameP95Ms',
    'observedFps',
    'droppedFrameRate',
    'rendererMainThreadUtilization',
    'gpuUtilizationAverage',
    'gpuUtilizationP95',
    'gpuMemoryAverageMiB',
    'gpuMemoryMaxMiB',
    'drawCallsPerFrame',
    'queueSubmitsPerFrame',
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
async function main() {
  const profileDir = await mkdtemp(resolve(tmpdir(), 'kline-render-bench-'))
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

    const chromeArgs = [
      '--headless=new',
      '--enable-gpu',
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

    const submissionRaw = await evaluate(
      page,
      'window.renderBench.runSubmissionBenchmark(7, 50, 400)',
    )
    const submissionBatching = {
      commandBuffersPerFrame: submissionRaw.commandBuffersPerFrame,
      repetitionsPerSample: submissionRaw.repetitionsPerSample,
      warmupFrames: submissionRaw.warmupFrames,
      sampleFrames: submissionRaw.sampleFrames,
      batchedSubmitP50Ms: percentile(submissionRaw.batchedSubmitMs, 0.5),
      batchedSubmitP95Ms: percentile(submissionRaw.batchedSubmitMs, 0.95),
      splitSubmitP50Ms: percentile(submissionRaw.splitSubmitMs, 0.5),
      splitSubmitP95Ms: percentile(submissionRaw.splitSubmitMs, 0.95),
      p50Speedup:
        percentile(submissionRaw.batchedSubmitMs, 0.5) > 0
          ? percentile(submissionRaw.splitSubmitMs, 0.5) /
            percentile(submissionRaw.batchedSubmitMs, 0.5)
          : null,
      raw: submissionRaw,
    }
    process.stdout.write(
      `WebGPU submit A/B: one=${submissionBatching.batchedSubmitP50Ms.toFixed(3)}ms, ` +
        `seven=${submissionBatching.splitSubmitP50Ms.toFixed(3)}ms, ` +
        `speedup=${submissionBatching.p50Speedup?.toFixed(2) ?? 'N/A'}x\n`,
    )

    const processInfo = await browser.send('SystemInfo.getProcessInfo')
    const chromeProcessIds = processInfo.processInfo.map((process) => Number(process.id))
    gpuSampler = beginGpuSampling(chromeProcessIds)
    const refreshIntervals = await evaluate(page, 'window.renderBench.measureRefreshIntervals(180)')
    const refreshIntervalMs = percentile(refreshIntervals, 0.5)
    if (!refreshIntervalMs || refreshIntervalMs <= 0) {
      throw new Error('Unable to calibrate requestAnimationFrame refresh interval')
    }
    const scenarios = []
    for (const visiblePoints of visiblePointSets) {
      for (const backend of ['canvas2d', 'webgl2', 'webgpu']) {
        const options = {
          backend,
          visiblePoints,
          width,
          height,
          dpr,
          warmupFrames,
          sampleFrames,
        }
        const before = await performanceMetrics(page)
        const resourceStartedAt = Date.now()
        const startedAt = performance.now()
        const result = await evaluate(
          page,
          `window.renderBench.runScenario(${JSON.stringify(options)})`,
        )
        const resourceEndedAt = Date.now()
        const gpuSamples = gpuSampler.between(resourceStartedAt, resourceEndedAt)
        const elapsedSeconds = (performance.now() - startedAt) / 1000
        const after = await performanceMetrics(page)
        const taskDuration = Math.max(0, (after.TaskDuration ?? 0) - (before.TaskDuration ?? 0))
        const mainThreadUtilization =
          elapsedSeconds > 0 ? (taskDuration / elapsedSeconds) * 100 : null
        scenarios.push(summarize(result, { gpuSamples, mainThreadUtilization }, refreshIntervalMs))
        process.stdout.write(
          `${backend} ${visiblePoints}: CPU P50=${scenarios.at(-1).summary.cpuFrameP50Ms?.toFixed(3)}ms, ` +
            `GPU P50=${scenarios.at(-1).summary.gpuFrameP50Ms?.toFixed(3) ?? 'N/A'}ms, ` +
            `FPS=${scenarios.at(-1).summary.observedFps?.toFixed(1)}\n`,
        )
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
        visiblePointSets,
        warmupFrames,
        sampleFrames,
        width,
        height,
        dpr,
        refreshIntervalMs,
        nominalRefreshRateHz: 1000 / refreshIntervalMs,
        indicators: ['MA5', 'MA20', 'MA60'],
        panes: 1,
        webgpuMsaa: 4,
      },
      submissionBatching,
      scenarios,
    }

    const resultsDir = resolve(benchDir, 'results')
    await mkdir(resultsDir, { recursive: true })
    await writeFile(
      resolve(resultsDir, 'render-bench-local.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    )
    await writeFile(resolve(resultsDir, 'render-bench-local.csv'), toCsv(scenarios))
    process.stdout.write(`Results: ${resolve(resultsDir, 'render-bench-local.json')}\n`)
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
