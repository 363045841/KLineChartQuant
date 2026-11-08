/**
 * 应用窗口创建：无边框标题栏、平台差异、外链策略与首屏时机。
 *
 * macOS 保留系统红绿灯并调整位置；Windows / Linux 使用无边框窗口，
 * 最小化 / 最大化 / 关闭由渲染进程自绘并通过 IPC 控制。
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { BrowserWindow, nativeTheme, shell } from 'electron'

import { APPLICATION_ICON } from './app-icon'
import { TITLEBAR_HEIGHT } from './window-bridge'

const currentDirectory = dirname(fileURLToPath(import.meta.url))

/** 首屏底色：对应 core 的 `--klc-color-background`，只用于页面首帧之前防闪白。 */
const WINDOW_BACKGROUND = { light: '#F5F5F7', dark: '#151619' } as const

/**
 * 创建一扇应用窗口并加载界面。
 *
 * @param workspaceId 工作区身份；渲染进程据此恢复自己的标签页集合
 * @param accentSlot 工作区标识色槽位；由窗口集合分配，保证同屏窗口不撞色
 * @returns 已配置好标题栏、preload 与加载入口的窗口；调用方负责显示时机以外的生命周期
 */
export function createMainWindow(workspaceId: string, accentSlot: number): BrowserWindow {
  const isMac = process.platform === 'darwin'
  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 720,
    minHeight: 600,
    show: false,
    icon: APPLICATION_ICON,
    backgroundColor: nativeTheme.shouldUseDarkColors
      ? WINDOW_BACKGROUND.dark
      : WINDOW_BACKGROUND.light,
    // macOS 保留原生红绿灯；其它平台去掉原生框架，窗口按钮由渲染进程自绘。
    frame: isMac ? undefined : false,
    titleBarStyle: 'hidden',
    ...(isMac ? { trafficLightPosition: { x: 16, y: 8 } } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      webgl: true,
      preload: join(currentDirectory, '../preload/preload.cjs'),
    },
  })

  window.on('ready-to-show', () => window.show())

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  // 工作区身份与标识色槽位经 URL 下发：preload 不读取 argv，渲染进程也不需要额外 IPC 就能取到。
  if (process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(process.env.ELECTRON_RENDERER_URL)
    url.searchParams.set('workspace', workspaceId)
    url.searchParams.set('accent', String(accentSlot))
    void window.loadURL(url.toString())
  } else {
    void window.loadFile(join(currentDirectory, '../renderer/index.html'), {
      query: { workspace: workspaceId, accent: String(accentSlot) },
    })
  }

  return window
}
