/**
 * 桌面端统一构建入口：macOS 复用 build:mac 的按架构打包，其余平台保持原有流程。
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const desktop = path.join(root, 'packages/desktop-electron')
// Windows 上 pnpm 只有 .cmd 包装，Node 直接执行既不认 PATHEXT 也拒绝 .cmd，
// 会报 spawnSync pnpm ENOENT；交给 cmd.exe 解析。其余平台 pnpm 本身可执行。
const pnpmLauncher =
  process.platform === 'win32' ? ['cmd.exe', ['/d', '/s', '/c', 'pnpm']] : ['pnpm', []]

/** 在桌面包目录执行 pnpm 子命令，保留完整输出并传播失败。 */
function runPnpm(...args) {
  execFileSync(pnpmLauncher[0], [...pnpmLauncher[1], ...args], {
    cwd: desktop,
    stdio: 'inherit',
  })
}

/** 在桌面包目录执行 Node 脚本，保留完整输出并传播失败。 */
function runNode(script, args) {
  execFileSync(process.execPath, [script, ...args], { cwd: desktop, stdio: 'inherit' })
}

if (process.platform === 'darwin') {
  // 与发版走同一条路径，避免本机构建绕过最低系统声明和 Mach-O 校验。
  runNode(path.join(root, 'scripts/build-macos-desktop.mjs'), ['--arch', process.arch])
} else {
  runPnpm('build:backends')
  runPnpm('exec', 'electron-vite', 'build')
  runPnpm('exec', 'electron-builder')
}
