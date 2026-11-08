/**
 * 应用菜单。
 *
 * Windows / Linux 的标题栏被 WCO 覆盖，菜单栏不可见，但 Electron 的全局快捷键
 * 只有挂在菜单项上才生效，因此三个平台都安装同一份菜单。
 */
import { Menu, type MenuItemConstructorOptions } from 'electron'

/** 新建窗口的快捷键；macOS 沿用系统惯例的 Cmd+N。 */
function newWindowAccelerator(platform: NodeJS.Platform): string {
  return platform === 'darwin' ? 'Cmd+N' : 'Ctrl+Shift+N'
}

/**
 * 安装应用菜单。
 *
 * @param options.platform 宿主平台
 * @param options.openWindow 新建一扇空白窗口
 */
export function installApplicationMenu(options: {
  platform: NodeJS.Platform
  openWindow: () => void
}): void {
  const template: MenuItemConstructorOptions[] = [
    ...(options.platform === 'darwin' ? [{ role: 'appMenu' } as const] : []),
    {
      label: '文件',
      submenu: [
        {
          label: '新建窗口',
          accelerator: newWindowAccelerator(options.platform),
          click: () => options.openWindow(),
        },
        { type: 'separator' },
        options.platform === 'darwin' ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
