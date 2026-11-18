/** 桌面端统一构建入口：macOS 复用 build:mac 的按架构打包，其余平台保持原有流程。 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const desktop = path.join(root, 'packages/desktop-electron')

/** 在桌面包目录执行命令，保留完整输出并传播失败。 */
function run(command, args) {
  execFileSync(command, args, { cwd: desktop, stdio: 'inherit' })
}

if (process.platform === 'darwin') {
  // 与发版走同一条路径，避免本机构建绕过最低系统声明和 Mach-O 校验。
  run(process.execPath, [
    path.join(root, 'scripts/build-macos-desktop.mjs'),
    '--arch',
    process.arch,
  ])
} else {
  run('pnpm', ['build:backends'])
  run('pnpm', ['exec', 'electron-vite', 'build'])
  run('pnpm', ['exec', 'electron-builder'])
}
