/** 隔离安装实际 tarball，验证公开类型、生产构建、资源与源码工作台的视觉一致性。 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build, preview } from 'vite'
import { chromium } from '@playwright/test'

const root = fileURLToPath(new URL('..', import.meta.url))
const artifacts = path.join(root, 'artifacts/product')
rmSync(path.join(artifacts, 'verified.json'), { force: true })
const manifest = JSON.parse(readFileSync(path.join(artifacts, 'manifest.json'), 'utf8'))
const tarball = path.join(artifacts, manifest.tarball)
assert.equal(createHash('sha256').update(readFileSync(tarball)).digest('hex'), manifest.sha256)
const directory = mkdtempSync(path.join(tmpdir(), 'klinechart-product-'))
console.log(`Isolated product fixture: ${directory}`)
const fixture = path.join(root, 'scripts/fixtures/vue-product')
const sourceRoot = path.join(directory, 'source')
const consumer = path.join(directory, 'consumer')
const rootPackage = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
const vuePackage = JSON.parse(readFileSync(path.join(root, 'packages/vue/package.json'), 'utf8'))

/** 运行独立消费项目的命令，失败立即终止发布。 */
function run(args, cwd = consumer) {
  const result = spawnSync('pnpm', args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.status !== 0) throw new Error(`Product consumer failed: pnpm ${args.join(' ')}`)
}

for (const destination of [consumer, sourceRoot]) {
  cpSync(fixture, destination, { recursive: true })
  const entry = path.join(destination, 'main.ts')
  writeFileSync(entry, readFileSync(entry, 'utf8').replaceAll('__PRODUCT_NAME__', manifest.name))
  const data = readFileSync(path.join(root, 'packages/desktop-electron/src/features/agent/chart-e2e-fixture.ts'), 'utf8')
  writeFileSync(path.join(destination, 'data.ts'), data
    .replaceAll('@363045841yyt/klinechart-core/controllers', manifest.name)
    .replaceAll('@363045841yyt/klinechart-core/market-data', manifest.name))
}
writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({
  private: true,
  type: 'module',
  dependencies: { [manifest.name]: `file:${tarball.split(path.sep).join('/')}`, vue: vuePackage.devDependencies.vue },
  devDependencies: { vite: rootPackage.devDependencies.vite, typescript: rootPackage.devDependencies.typescript },
}, null, 2))
run(['install', '--ignore-scripts', '--no-frozen-lockfile'])
const installed = JSON.parse(readFileSync(path.join(consumer, 'node_modules', manifest.name, 'package.json'), 'utf8'))
for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
  assert.ok(!Object.keys(installed[field] ?? {}).some((name) => /^@[^/]+\/klinechart(?:-|$)/.test(name)))
}
run(['exec', 'tsc', '--noEmit', '-p', 'tsconfig.json'])
run(['exec', 'vite', 'build', '--base', '/product-test/', '--logLevel', 'warn'])

const requireVue = createRequire(path.join(root, 'packages/vue/package.json'))
const { default: vuePlugin } = await import(pathToFileURL(requireVue.resolve('@vitejs/plugin-vue')).href)
const { default: icons } = await import(pathToFileURL(requireVue.resolve('unplugin-icons/vite')).href)
await build({
  configFile: false,
  logLevel: 'warn',
  root: sourceRoot,
  base: '/product-test/',
  plugins: [vuePlugin(), icons({ compiler: 'vue3' })],
  resolve: {
    alias: [
      { find: `${manifest.name}/style.css`, replacement: path.join(root, 'packages/vue/dist/index.css') },
      { find: manifest.name, replacement: path.join(root, 'packages/vue/src/index.ts') },
      { find: /^@vue-src\//, replacement: `${path.join(root, 'packages/vue/src')}/` },
      { find: /^vue$/, replacement: requireVue.resolve('vue/dist/vue.runtime.esm-bundler.js') },
    ],
  },
  build: { target: 'esnext' },
  worker: { format: 'es' },
})

const servers = []
const browser = await chromium.launch({ headless: true })
/**
 * Chromium 会把视口边缘 3px 圆角的抗锯齿落在相邻 1 色阶之间，同一构建重复加载也会抖动，
 * 与源码/打包差异无关；只吸收单像素级噪声，成片或更大色差仍然失败。
 */
const SCREENSHOT_CHANNEL_TOLERANCE = 1
const SCREENSHOT_PIXEL_BUDGET = 8
/** 把截图编码成浏览器可解码的 data URL。 */
function screenshotUrl(buffer) {
  return `data:image/png;base64,${buffer.toString('base64')}`
}
/** 在浏览器内解码两张 PNG，统计超差像素数量、最大色差与范围。 */
async function compareScreenshots(left, right) {
  const page = await browser.newPage()
  try {
    return await page.evaluate(async ([first, second]) => {
      /** 解码一张截图，失败立即返回可展示的错误。 */
      const load = (src) =>
        new Promise((resolve, reject) => {
          const image = new Image()
          image.onload = () => resolve(image)
          image.onerror = () => reject(new Error('Screenshot decode failed'))
          image.src = src
        })
      const [one, two] = await Promise.all([load(first), load(second)])
      const canvas = new OffscreenCanvas(one.width, one.height)
      const context = canvas.getContext('2d')
      /** 读取整张截图的 RGBA 像素。 */
      const pixels = (image) => {
        context.clearRect(0, 0, canvas.width, canvas.height)
        context.drawImage(image, 0, 0)
        return context.getImageData(0, 0, canvas.width, canvas.height).data
      }
      const before = pixels(one)
      const after = pixels(two)
      let count = 0
      let maxDelta = 0
      let box = null
      for (let index = 0; index < before.length; index += 4) {
        const delta = Math.max(
          Math.abs(before[index] - after[index]),
          Math.abs(before[index + 1] - after[index + 1]),
          Math.abs(before[index + 2] - after[index + 2]),
          Math.abs(before[index + 3] - after[index + 3]),
        )
        if (delta === 0) continue
        count += 1
        maxDelta = Math.max(maxDelta, delta)
        const pixel = index / 4
        const x = pixel % canvas.width
        const y = Math.floor(pixel / canvas.width)
        box = box
          ? [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)]
          : [x, y, x, y]
      }
      return { count, maxDelta, box }
    }, [screenshotUrl(left), screenshotUrl(right)])
  } finally {
    await page.close()
  }
}
/** 断言两张截图只在允许的噪声范围内一致；失败信息带上差异规模便于定位。 */
async function assertSameScreenshot(left, right, message) {
  const { count, maxDelta, box } = await compareScreenshots(left, right)
  assert.ok(
    maxDelta <= SCREENSHOT_CHANNEL_TOLERANCE && count <= SCREENSHOT_PIXEL_BUDGET,
    `${message}: differing pixels=${count}, max channel delta=${maxDelta}, box=${JSON.stringify(box)}`,
  )
}
const failures = []
const screenshots = []
const fullScreenshots = []
const browserOptions = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: 'reduce', locale: 'zh-CN', timezoneId: 'Asia/Shanghai' }
/** 为每个独立页面记录真实资源和运行时故障。 */
function observePage(page, onWorker) {
  page.on('pageerror', (error) => failures.push(error.message))
  page.on('response', (response) => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`) })
  page.on('requestfailed', (request) => failures.push(`${request.url()}: ${request.failure()?.errorText}`))
  page.on('worker', onWorker)
}
try {
  for (const target of [sourceRoot, consumer]) {
    const server = await preview({ configFile: false, root: target, base: '/product-test/', preview: { host: '127.0.0.1', port: 0 } })
    servers.push(server)
    const address = server.httpServer.address()
    assert.ok(address && typeof address !== 'string')
    const origin = `http://127.0.0.1:${address.port}/product-test/`
    let context = await browser.newContext(browserOptions)
    let page = await context.newPage()
    let workers = 0
    observePage(page, () => { workers += 1 })
    const requested = []
    page.on('request', (request) => requested.push(request.url()))
    await page.goto(`${origin}?agent=0&scripts=0`)
    await page.waitForFunction(() => document.body.dataset.bars === '160')
    await page.waitForFunction(() => document.body.dataset.loading === 'false')
    assert.equal(workers, 0, 'Disabled features must not start Workers')
    assert.equal(await page.getByRole('button', { name: '代码编辑器', exact: true }).count(), 0, 'Disabled scripting must hide the editor entry')
    assert.ok(!requested.some((url) => /WorkbenchAgent|ScriptEditorHost|createScriptLanguageSession/.test(url)), 'Disabled features must not download their implementation chunks')
    assert.ok(await page.locator('canvas').count() > 0)
    await page.evaluate(async () => { await document.fonts.ready })
    await page.mouse.move(1439, 899)
    const screenshot = await page.locator('#app').screenshot({ animations: 'disabled' })
    const label = target === sourceRoot ? 'source' : 'package'
    writeFileSync(path.join(artifacts, `${label}.png`), screenshot)
    screenshots.push(screenshot)
    const beforeUpdate = await page.evaluate(() => ({ close: Number(document.body.dataset.latestClose), requests: document.body.dataset.historyRequests }))
    await page.getByRole('button', { name: '更新末根', exact: true }).click()
    await page.waitForFunction((close) => Number(document.body.dataset.latestClose) === close + 1, beforeUpdate.close)
    assert.equal(await page.evaluate(() => document.body.dataset.bars), '160')
    assert.equal(await page.evaluate(() => document.body.dataset.historyRequests), beforeUpdate.requests, 'Incremental updates must not refetch or replace history')
    await page.getByRole('button', { name: '追加一根', exact: true }).click()
    await page.waitForFunction(() => document.body.dataset.bars === '161')
    await page.getByRole('button', { name: '切换主题' }).click()
    await page.waitForFunction(() => document.querySelector('.kline-workbench')?.getAttribute('data-theme') === 'dark')
    await page.getByRole('button', { name: '卸载工作台' }).click()
    await page.waitForFunction(() => document.querySelectorAll('canvas').length === 0)
    await page.waitForFunction(() => document.body.dataset.activeStreams === '0')
    // 独立场景使用独立存储和写锁，不继承前一场景保存在 IndexedDB 中的布局。
    await context.close()
    context = await browser.newContext(browserOptions)
    page = await context.newPage()
    workers = 0
    observePage(page, () => { workers += 1 })
    await page.goto(origin)
    await page.waitForFunction(() => document.body.dataset.bars === '160', null, { timeout: 120_000 })
    await page.waitForFunction(() => document.body.dataset.loading === 'false')
    await page.locator('.agent-workspace').waitFor({ timeout: 60_000 })
    await page.locator('.composer__input').waitFor({ timeout: 60_000 })
    assert.ok(workers > 0, 'Enabled scripts must start the execution Worker')
    // 脚本服务异步初始化：截图和运行都要在编辑器入口出现（服务就绪）之后，避免只拿到空草稿。
    await page.getByRole('button', { name: '代码编辑器', exact: true }).waitFor({ timeout: 60_000 })
    await page.evaluate(async () => { await document.fonts.ready })
    await page.mouse.move(1439, 899)
    const fullScreenshot = await page.locator('#app').screenshot({ animations: 'disabled' })
    writeFileSync(path.join(artifacts, `${label}-full.png`), fullScreenshot)
    fullScreenshots.push(fullScreenshot)
    // 模拟 CSS 分块以相反顺序到达，业务外观不能依赖共享控件的加载先后。
    const cascadeChanges = await page.evaluate(async () => {
      const elements = [...document.querySelectorAll('#app *')]
      const snapshot = () => elements.map((element) => {
        const style = getComputedStyle(element)
        return Object.fromEntries([...style].map((name) => [name, style.getPropertyValue(name)]))
      })
      const before = snapshot()
      const original = [...document.querySelectorAll('link[rel="stylesheet"], style')]
      const styles = original.map((style) => style.cloneNode(true))
      const loaded = styles.map((style) => style instanceof HTMLLinkElement
        ? new Promise((resolve, reject) => { style.addEventListener('load', resolve, { once: true }); style.addEventListener('error', reject, { once: true }) })
        : Promise.resolve())
      for (const style of styles.reverse()) document.head.append(style)
      await Promise.all(loaded)
      for (const style of original) style.remove()
      await document.fonts.ready
      const after = snapshot()
      return elements.flatMap((element, index) => {
        const changes = Object.entries(before[index]).filter(([name, value]) => after[index][name] !== value)
        return changes.length ? [{ element: element.tagName, class: element.className, changes: changes.map(([name, value]) => [name, value, after[index][name]]) }] : []
      })
    })
    writeFileSync(path.join(artifacts, `${label}-css-order.json`), JSON.stringify(cascadeChanges, null, 2))
    const reorderedScreenshot = await page.locator('#app').screenshot({ animations: 'disabled' })
    writeFileSync(path.join(artifacts, `${label}-css-reordered.png`), reorderedScreenshot)
    await assertSameScreenshot(
      fullScreenshot,
      reorderedScreenshot,
      `${label} workbench changes when stylesheet order is reversed`,
    )
    await page.getByRole('button', { name: '代码编辑器', exact: true }).click()
    await page.locator('.cm-editor').waitFor({ timeout: 60_000 })
    const runButton = page.getByRole('button', { name: '运行代码', exact: true })
    await runButton.click()
    await page.waitForFunction(() => document.querySelector('button[aria-label="运行代码"]')?.getAttribute('aria-busy') === 'false', null, { timeout: 60_000 })
    assert.equal(await page.locator('[data-panel="problems"] span').count(), 0, 'The default script must execute without compiler or runtime problems')
    const popupReady = page.waitForEvent('popup')
    await page.getByRole('button', { name: '在新窗口打开', exact: true }).click()
    const popup = await popupReady
    popup.on('pageerror', (error) => failures.push(error.message))
    popup.on('requestfailed', (request) => failures.push(`${request.url()}: ${request.failure()?.errorText}`))
    await popup.locator('.cm-editor').waitFor({ timeout: 60_000 })
    await popup.close()
    await page.keyboard.press('Escape')
    await page.locator('dialog[open]').waitFor({ state: 'hidden' })
    await page.getByRole('button', { name: '卸载工作台' }).click()
    await context.close()
  }
  assert.deepEqual(failures, [], 'Production consumer must have no browser or resource errors')
  await assertSameScreenshot(
    screenshots[0],
    screenshots[1],
    'Source and packed workbench screenshots differ; see artifacts/product/{source,package}.png',
  )
  await assertSameScreenshot(
    fullScreenshots[0],
    fullScreenshots[1],
    'Full source and packed workbench screenshots differ; see artifacts/product/{source,package}-full.png',
  )
  writeFileSync(path.join(artifacts, 'verified.json'), JSON.stringify({ ...manifest, checks: ['isolated-install', 'public-types', 'production-build', 'source-screenshot-parity', 'registered-source', 'tail-update', 'bar-append', 'stream-cleanup', 'disabled-workers', 'script-worker', 'agent-panel', 'editor', 'script-execution', 'detached-editor', 'theme', 'unmount'] }, null, 2) + '\n')
  console.log(`Product consumer passed. Fixture retained at ${directory}`)
} catch (error) {
  writeFileSync(path.join(artifacts, 'failure.txt'), `${String(error)}\n${failures.join('\n')}`)
  for (const [index, context] of browser.contexts().entries()) {
    for (const [pageIndex, page] of context.pages().entries()) {
      writeFileSync(path.join(artifacts, `failure-${index}-${pageIndex}.html`), await page.content())
      await page.screenshot({ path: path.join(artifacts, `failure-${index}-${pageIndex}.png`) })
    }
  }
  throw error
} finally {
  await browser.close()
  for (const server of servers) await new Promise((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()))
}
