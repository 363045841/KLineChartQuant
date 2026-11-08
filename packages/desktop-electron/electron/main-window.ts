/**
 * 主窗口创建：无边框标题栏、平台差异、外链策略与首屏时机。
 *
 * macOS 保留系统红绿灯并调整位置；Windows / Linux 用 Window Controls Overlay
 * 提供原生按钮，标题栏本体由渲染进程绘制。
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { BrowserWindow, nativeTheme, shell } from 'electron'

import { applyTitleBarTheme, TITLEBAR_THEMES } from './titlebar-theme'
import { TITLEBAR_HEIGHT, type WindowTheme } from './window-bridge'

const currentDirectory = dirname(fileURLToPath(import.meta.url))

/** 首屏配色跟随系统主题；渲染进程拿到图表有效主题后会再同步一次。 */
function systemTheme(): WindowTheme {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
}

/**
 * 创建一扇应用窗口并加载界面。
 *
 * @param workspaceId 工作区身份；渲染进程据此恢复自己的标签页集合
 * @returns 已配置好标题栏、preload 与加载入口的窗口；调用方负责显示时机以外的生命周期
 */
export function createMainWindow(workspaceId: string): BrowserWindow {
  const theme = systemTheme()
  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 720,
    minHeight: 600,
    show: false,
    // 页面首帧之前由窗口底色兜底，避免深色主题下闪白。
    backgroundColor: TITLEBAR_THEMES[theme].color,
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: 16, y: 7 } }
      : { titleBarOverlay: { height: TITLEBAR_HEIGHT, ...TITLEBAR_THEMES[theme] } }),
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

  // 工作区身份经 URL 下发：preload 不读取 argv，渲染进程也不需要额外 IPC 就能取到。
  if (process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(process.env.ELECTRON_RENDERER_URL)
    url.searchParams.set('workspace', workspaceId)
    void window.loadURL(url.toString())
  } else {
    void window.loadFile(join(currentDirectory, '../renderer/index.html'), {
      query: { workspace: workspaceId },
    })
  }

  // 构造参数与这里都写一次，保证渲染进程尚未回报主题时原生按钮也是正确配色。
  applyTitleBarTheme(window, theme)
  return window
}
