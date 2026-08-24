import { fileURLToPath } from 'node:url'

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test'

const mainEntry = fileURLToPath(new URL('../out/main/main.js', import.meta.url))

async function setWindowSize(
  application: ElectronApplication,
  width: number,
  height: number,
): Promise<void> {
  await application.evaluate(
    ({ BrowserWindow }, size) => {
      const window = BrowserWindow.getAllWindows()[0]
      window?.setSize(size.width, size.height)
    },
    { width, height },
  )
}

async function expectNonBlankCanvas(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        const canvasState = await page.locator('canvas').evaluateAll((canvases) =>
          canvases.map((canvas) => {
            if (
              !(canvas instanceof HTMLCanvasElement) ||
              canvas.width === 0 ||
              canvas.height === 0
            ) {
              return { pixels: 0, nonBlank: 0 }
            }
            const context = canvas.getContext('2d')
            if (!context) return { pixels: canvas.width * canvas.height, nonBlank: 1 }
            const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
            let nonBlank = 0
            const stride = Math.max(4, Math.floor(data.length / 24_000 / 4) * 4)
            for (let index = 0; index < data.length; index += stride) {
              const alpha = data[index + 3] ?? 0
              const red = data[index] ?? 0
              const green = data[index + 1] ?? 0
              const blue = data[index + 2] ?? 0
              if (alpha > 0 && (red !== 0 || green !== 0 || blue !== 0)) nonBlank += 1
            }
            return { pixels: canvas.width * canvas.height, nonBlank }
          }),
        )
        return canvasState.some((canvas) => canvas.pixels > 0 && canvas.nonBlank > 0)
      },
      { timeout: 8_000 },
    )
    .toBe(true)
}

test('launches the chart and exercises the complete Agent workspace shell', async ({
  browserName: _browserName,
}, testInfo) => {
  const application = await electron.launch({
    args: [mainEntry, `--user-data-dir=${testInfo.outputPath('profile')}`],
    env: { ...process.env, NODE_ENV: 'test' },
  })

  try {
    const page = await application.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await setWindowSize(application, 1440, 900)

    const agentApiShape = await page.evaluate(
      (methodNames) => {
        const agent = window.desktopAPI?.agent as unknown as Record<string, unknown> | undefined
        return Object.fromEntries(methodNames.map((name) => [name, typeof agent?.[name]]))
      },
      [
        'cancelRun',
        'confirmTool',
        'createSession',
        'deleteProviderCredential',
        'deleteSession',
        'getProviderStatus',
        'listProviderModels',
        'listSessions',
        'openSession',
        'renameSession',
        'retryRun',
        'startRun',
        'subscribe',
        'testProvider',
        'undoTurn',
      ],
    )
    expect(Object.values(agentApiShape)).toEqual(Array(15).fill('function'))
    expect(await page.evaluate(() => 'ipcRenderer' in (window.desktopAPI?.agent ?? {}))).toBe(false)
    expect(
      await page.evaluate(async () => {
        try {
          await window.desktopAPI?.agent.startRun({
            sessionId: 'not-owned',
            prompt: 'Inspect',
            readOnly: true,
          })
          return null
        } catch (error) {
          return error
        }
      }),
    ).toMatchObject({ code: 'TARGET_MISMATCH', retryable: false })

    await expect(page.locator('.chart-surface')).toBeVisible()
    await expect(page.locator('.agent-panel')).toBeVisible()
    await expect(page.locator('.panel-resizer')).toHaveAttribute('aria-valuenow', '420')
    const chartLayout = await page.evaluate(() => {
      const shell = document.querySelector<HTMLElement>('.agent-workbench-shell')
      const surface = document.querySelector<HTMLElement>('.chart-surface')
      const chart = document.querySelector<HTMLElement>('.chart-wrapper')
      if (!shell || !surface || !chart) return null
      const surfaceBounds = surface.getBoundingClientRect()
      const chartBounds = chart.getBoundingClientRect()
      return {
        gutterBackground: getComputedStyle(surface).backgroundColor,
        shellBackground: getComputedStyle(shell).backgroundColor,
        topGutter: chartBounds.top - surfaceBounds.top,
        bottomGutter: surfaceBounds.bottom - chartBounds.bottom,
      }
    })
    expect(chartLayout).not.toBeNull()
    expect(chartLayout?.gutterBackground).toBe(chartLayout?.shellBackground)
    expect(chartLayout?.topGutter).toBeCloseTo(16, 0)
    expect(chartLayout?.bottomGutter).toBeCloseTo(16, 0)
    await page.screenshot({ path: testInfo.outputPath('agent-initial.png') })
    await expectNonBlankCanvas(page)

    await page.locator('.panel-resizer').focus()
    await page.keyboard.press('End')
    await expect(page.locator('.panel-resizer')).toHaveAttribute('aria-valuenow', '640')
    await expect(page.locator('.agent-panel')).toHaveCSS('width', '640px')
    await page.screenshot({ path: testInfo.outputPath('agent-1440x900.png') })

    await page.locator('.empty-state__prompts button').first().click()
    const textarea = page.locator('.composer textarea')
    const preservedPrompt = await textarea.inputValue()
    await textarea.press('Enter')
    await expect(page.locator('.settings-dialog')).toBeVisible()
    await expect(textarea).toHaveValue(preservedPrompt)

    const settingsInputs = page.locator('.settings-dialog input')
    await settingsInputs.nth(0).fill('https://api.302.ai/v1')
    await settingsInputs.nth(1).fill('e2e-placeholder-key')
    await settingsInputs.nth(2).fill('fast-sota-model')
    await page.locator('.settings-dialog .primary-button').click()
    await expect(page.locator('.settings-dialog__stages li')).toHaveCount(3)
    await page.locator('.settings-dialog > header .icon-button').click()
    await expect(page.locator('.settings-dialog')).toBeHidden()
    await expect(textarea).toHaveValue(preservedPrompt)

    await textarea.press('Enter')
    await expect(page.locator('.run-summary[data-status="completed"]')).toBeVisible()
    await expect(page.locator('.tool-card[data-status="succeeded"]')).toBeVisible()

    await textarea.fill('Add EMA 20')
    await textarea.press('Enter')
    await expect(page.locator('.composer__primary--stop')).toBeVisible()
    await expect(page.locator('.tool-card')).toHaveCount(2)
    await expect(page.locator('.tool-card').nth(1)).toHaveAttribute('data-status', 'succeeded')
    await page.locator('.composer__primary--stop').click()
    await expect(page.locator('.run-summary[data-status="partial"]')).toBeVisible()

    await page.locator('.panel-resizer').focus()
    await page.keyboard.press('Home')
    await setWindowSize(application, 1024, 720)
    await expect(page.locator('.agent-panel')).toHaveCSS('width', '360px')
    await expectNonBlankCanvas(page)
    await page.screenshot({ path: testInfo.outputPath('agent-1024x720.png') })

    await setWindowSize(application, 760, 700)
    await expect(page.locator('.panel-resizer')).toBeHidden()
    await expect(page.locator('.agent-panel')).toHaveCSS('position', 'absolute')
    await expect(page.locator('.chart-surface')).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('agent-760x700.png') })

    await page.getByTestId('agent-panel-close').click()
    await expect(page.locator('.agent-launcher')).toBeVisible()
    await expect(page.locator('.chart-surface')).toBeVisible()
    await expectNonBlankCanvas(page)
  } finally {
    await application.close()
  }
})

test('reopens the persisted native Agent session after an app restart', async ({
  browserName: _browserName,
}, testInfo) => {
  const profile = testInfo.outputPath('persistent-profile')
  const prompt = 'Analyze persisted RSI evidence'
  let application = await electron.launch({
    args: [mainEntry, `--user-data-dir=${profile}`],
    env: { ...process.env, NODE_ENV: 'test' },
  })

  try {
    let page = await application.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    const textarea = page.locator('.composer textarea')
    await textarea.fill(prompt)
    await textarea.press('Enter')
    await expect(page.locator('.settings-dialog')).toBeVisible()
    const inputs = page.locator('.settings-dialog input')
    await inputs.nth(0).fill('https://api.302.ai/v1')
    await inputs.nth(1).fill('ephemeral-e2e-key')
    await inputs.nth(2).fill('faux-fast')
    await page.locator('.settings-dialog .primary-button').click()
    await expect(page.locator('.settings-dialog__stages li')).toHaveCount(3)
    await page.locator('.settings-dialog > header .icon-button').click()
    await expect(page.locator('.settings-dialog')).toBeHidden()
    await textarea.press('Enter')
    await expect(page.locator('.run-summary[data-status="completed"]')).toBeVisible()
    await application.close()

    application = await electron.launch({
      args: [mainEntry, `--user-data-dir=${profile}`],
      env: { ...process.env, NODE_ENV: 'test' },
    })
    page = await application.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('.message--user')).toContainText(prompt)
    await expect(page.locator('.run-summary[data-status="completed"]')).toBeVisible()
    await expect(page.locator('.tool-card[data-status="succeeded"]')).toBeVisible()
  } finally {
    await application.close()
  }
})
