/** 应用图标路径：开发态读取构建资源，安装后读取随包分发的原生图标。 */
import { join } from 'node:path'

import { app } from 'electron'

const iconDirectory = app.isPackaged
  ? join(process.resourcesPath, 'icons')
  : join(app.getAppPath(), 'build')

export const APPLICATION_ICON = join(
  iconDirectory,
  process.platform === 'win32' ? 'icon.ico' : 'icon.png',
)
