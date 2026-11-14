/** Chromium 断言：安装后的包能挂载、渲染、运行脚本，且没有资源或运行时错误。 */
import { expect, test } from '@playwright/test'

/** 收集单个页面会话里的运行时与资源故障，测试结束时统一断言。 */
function observe(page: import('@playwright/test').Page): string[] {
  const failures: string[] = []
  page.on('pageerror', (error) => failures.push(error.message))
  page.on('response', (response) => {
    if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`)
  })
  page.on('requestfailed', (request) => {
    failures.push(`${request.url()}: ${request.failure()?.errorText}`)
  })
  return failures
}

/** 截图前固定字体和指针位置，避免渲染时序造成的噪声。 */
async function settle(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready
  })
  await page.mouse.move(1439, 899)
}

test('已发布的包能渲染基础图表', async ({ page }) => {
  const failures = observe(page)
  let workers = 0
  page.on('worker', () => {
    workers += 1
  })
  const requested: string[] = []
  page.on('request', (request) => requested.push(request.url()))

  await page.goto('/?agent=0&scripts=0')
  await page.waitForFunction(() => document.body.dataset.bars === '160')
  await page.waitForFunction(() => document.body.dataset.loading === 'false')

  await expect(page.locator('canvas').first()).toBeVisible()
  expect(workers).toBe(0)
  expect(
    requested.some((url) => /WorkbenchAgent|ScriptEditorHost|createScriptLanguageSession/.test(url)),
  ).toBe(false)

  await settle(page)
  await page.screenshot({ path: 'test-results/base.png', fullPage: true })
  expect(failures).toEqual([])
})

test('默认工作台能加载 Agent、打开编辑器并运行脚本', async ({ page }) => {
  test.setTimeout(240_000)
  const failures = observe(page)
  await page.goto('/')
  await page.waitForFunction(() => document.body.dataset.bars === '160', undefined, { timeout: 120_000 })
  await page.waitForFunction(() => document.body.dataset.loading === 'false')
  // Agent 面板只在首次点开时挂载，先通过侧边菜单展开。
  await page.getByRole('button', { name: 'Agent', exact: true }).click()
  await page.locator('.agent-workspace').waitFor({ timeout: 60_000 })

  await settle(page)
  await page.screenshot({ path: 'test-results/workbench.png', fullPage: true })

  await page.getByRole('button', { name: '代码编辑器', exact: true }).click()
  await page.locator('.cm-editor').waitFor({ timeout: 60_000 })
  await page.getByRole('button', { name: '运行代码', exact: true }).click()
  await page.waitForFunction(
    () => document.querySelector('button[aria-label="运行代码"]')?.getAttribute('aria-busy') === 'false',
    undefined,
    { timeout: 60_000 },
  )
  expect(await page.locator('[data-panel="problems"] span').count()).toBe(0)
  expect(failures).toEqual([])
})
