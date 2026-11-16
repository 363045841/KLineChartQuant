/**
 * macOS 桌面包的唯一目标定义；矩阵、打包与产物校验共用这份常量。
 *
 * 只发 Electron 45 的 macOS 13+ 包：Electron 44 起 Chromium 不再支持 macOS 12，
 * Go 1.27 起也要求 macOS 13；继续支持更老的系统只能锁在已停止维护的 Electron 线。
 */
export const macosDesktopTarget = {
  /** 产物文件名里的系统档位后缀 */
  label: 'macos13',
  /** Info.plist 的 LSMinimumSystemVersion，也是所有 Mach-O 允许的最高最低系统 */
  minimumSystemVersion: '13.0',
  /** 发版覆盖的 CPU 架构 */
  architectures: ['x64', 'arm64'],
}
