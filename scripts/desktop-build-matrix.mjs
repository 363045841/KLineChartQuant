/** 为手动构建和正式发版生成同一份桌面平台矩阵。 */
import { macosDesktopTarget } from './macos-desktop-target.mjs'

// Mac 的两种架构不能共用 runner：Intel 镜像只有 x64，macOS 26 镜像只有 arm64。
const macRunner = { x64: 'macos-15-intel', arm64: 'macos-26' }

const platforms = {
  windows: [{ os: 'windows-latest', artifact: 'windows-x64', arch: 'x64' }],
  linux: [{ os: 'ubuntu-24.04', artifact: 'linux-x64', arch: 'x64' }],
  macos: macosDesktopTarget.architectures.map((arch) => ({
    os: macRunner[arch],
    artifact: `${macosDesktopTarget.label}-${arch}`,
    arch,
  })),
}

const macTargets = platforms.macos.map((entry) => entry.artifact)
const selected = new Map()
const input = process.argv[2]
if (!input?.trim())
  throw new Error(`请指定 windows / macos / linux / all 或 ${macTargets.join(' / ')}`)
for (const name of input.split(',').map((item) => item.trim())) {
  let entries
  if (name === 'all') entries = Object.values(platforms).flat()
  else if (Object.hasOwn(platforms, name)) entries = platforms[name]
  else entries = platforms.macos.filter((entry) => entry.artifact === name)
  if (!entries.length)
    throw new Error(
      `未知桌面构建目标：${name}（可用 windows / macos / linux / all 或 ${macTargets.join(' / ')}）`,
    )
  // 同一目标重复出现时只保留第一次，避免矩阵里出现重复 job。
  for (const entry of entries) selected.set(entry.artifact, entry)
}
process.stdout.write(JSON.stringify({ include: [...selected.values()] }))
