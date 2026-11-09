/** 为手动构建和正式发版生成同一份桌面平台矩阵。 */
import { macosBuildProfiles } from './macos-build-profiles.mjs'

const platforms = {
  windows: [{ os: 'windows-latest', artifact: 'windows-x64', arch: 'x64', goVersion: 'stable' }],
  linux: [{ os: 'ubuntu-24.04', artifact: 'linux-x64', arch: 'x64', goVersion: 'stable' }],
  macos: Object.entries(macosBuildProfiles).flatMap(([profile, settings]) =>
    ['x64', 'arm64'].map((arch) => ({
      os: arch === 'x64' ? 'macos-15-intel' : 'macos-26',
      artifact: `${settings.label}-${arch}`,
      arch,
      profile,
      goVersion: settings.goVersion,
    })),
  ),
}

const selected = new Map()
const input = process.argv[2]
if (!input?.trim()) throw new Error('请指定 windows / macos / linux / all 或单个 Mac 包名称')
for (const name of input.split(',').map((item) => item.trim())) {
  let entries
  if (name === 'all') entries = Object.values(platforms).flat()
  else if (Object.hasOwn(platforms, name)) entries = platforms[name]
  else entries = platforms.macos.filter((entry) => entry.artifact === name)
  if (!entries.length) throw new Error(`未知桌面构建目标：${name}`)
  for (const entry of entries) selected.set(entry.artifact, entry)
}
process.stdout.write(JSON.stringify({ include: [...selected.values()] }))
