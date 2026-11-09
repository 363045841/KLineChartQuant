/** 启动真正打包的 Intel 应用，检查根界面、图表和随包后端；不替代 Monterey 真机验收。 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { join, resolve } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { chromium } from '@playwright/test'

const executable = join(resolve(process.argv[2]), 'Contents/MacOS/KLineChart Quant')
const debugPort = 19226
const child = spawn(executable, [`--remote-debugging-port=${debugPort}`], { stdio: 'inherit' })
const errors = []
let browser
try {
  // 后端首次探测行情服务器有等待时间，窗口只有在主进程装配完成后才出现。
  let endpoint
  for (let attempt = 0; attempt < 90; attempt += 1) {
    assert.equal(child.exitCode, null, '应用提前退出')
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`)
      endpoint = (await response.json()).webSocketDebuggerUrl
      if (endpoint) break
    } catch {
      // CDP 尚未监听时继续等待；到期后明确失败。
    }
    await setTimeout(1_000)
  }
  assert.ok(endpoint, '打包应用未提供调试端点')
  browser = await chromium.connectOverCDP(endpoint)
  const context = browser.contexts()[0]
  const page = context.pages()[0] ?? (await context.waitForEvent('page', { timeout: 90_000 }))
  page.on('pageerror', (error) => errors.push(error.message))
  await page.locator('#app > *').first().waitFor({ state: 'visible', timeout: 90_000 })
  await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 90_000 })
  for (const url of ['http://127.0.0.1:8080/health/live', 'http://127.0.0.1:8091/health']) {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    assert.ok(response.ok, `随包后端未就绪：${url}`)
  }
  assert.deepEqual(errors, [])
  console.log(
    `Packaged Intel app rendered ${await page.locator('canvas').count()} canvases; both backends healthy.`,
  )
} finally {
  await browser?.close()
  child.kill('SIGTERM')
}
