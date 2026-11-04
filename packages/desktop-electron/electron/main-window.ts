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
 * 创建主窗口并加载界面。
 *
 * @returns 已配置好标题栏、preload 与加载入口的窗口；调用方负责显示时机以外的生命周期
 */
export function createMainWindow(): BrowserWindow {
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

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(currentDirectory, '../renderer/index.html'))
  }

  // 构造参数与这里都写一次，保证渲染进程尚未回报主题时原生按钮也是正确配色。
  applyTitleBarTheme(window, theme)
  return window
}
