/** 校验 Mac 产物声明和实际 Mach-O 的最低系统、架构，避免仅改 plist 的假兼容包。 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { closeSync, openSync, readdirSync, readSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { resolveMacosBuildProfile } from './macos-build-profiles.mjs'

const app = resolve(process.argv[2])
const profile = resolveMacosBuildProfile(process.argv[3])
const architectures = { x64: 'x86_64', arm64: 'arm64' }
const architecture = architectures[process.argv[4]]
assert.ok(architecture, '请指定 x64 或 arm64')
const binaryMagic = new Set([
  'cffaedfe',
  'feedfacf',
  'cefaedfe',
  'feedface',
  'cafebabe',
  'bebafeca',
  'cafebabf',
  'bfbafeca',
])

/** 将系统版本转为可比较数值，保留次版本和修订版本。 */
function versionNumber(version) {
  const [major, minor = 0, patch = 0] = version.split('.').map(Number)
  return major * 1_000_000 + minor * 1_000 + patch
}

/** 调用系统自带的二进制检查工具，失败直接阻止上传产物。 */
function capture(command, args) {
  return execFileSync(command, args, { encoding: 'utf8' }).trim()
}

/** 遍历实际文件并跳过 Framework 符号链接，避免重复检查。 */
function* files(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filename = join(directory, entry.name)
    if (entry.isDirectory()) yield* files(filename)
    else if (entry.isFile()) yield filename
  }
}

const declaredMinimum = capture('/usr/libexec/PlistBuddy', [
  '-c',
  'Print :LSMinimumSystemVersion',
  join(app, 'Contents/Info.plist'),
])
assert.equal(declaredMinimum, profile.minimumSystemVersion)
if (profile.electronVersion) {
  const electronVersion = capture('/usr/libexec/PlistBuddy', [
    '-c',
    'Print :CFBundleVersion',
    join(app, 'Contents/Frameworks/Electron Framework.framework/Resources/Info.plist'),
  ])
  assert.equal(electronVersion, profile.electronVersion)
}

let checked = 0
for (const filename of files(app)) {
  const header = Buffer.alloc(4)
  const descriptor = openSync(filename, 'r')
  try {
    readSync(descriptor, header, 0, header.length, 0)
  } finally {
    closeSync(descriptor)
  }
  if (!binaryMagic.has(header.toString('hex'))) continue
  const archs = capture('lipo', ['-archs', filename]).split(/\s+/)
  assert.ok(archs.includes(architecture), `${filename} 缺少 ${architecture}`)
  const commands = capture('otool', ['-arch', architecture, '-l', filename]).split(
    /Load command \d+/,
  )
  const minimums = commands
    .filter((command) => /cmd LC_(BUILD_VERSION|VERSION_MIN_MACOSX)\b/.test(command))
    .map((command) => command.match(/\b(?:minos|version)\s+(\d+(?:\.\d+){0,2})/)?.[1])
  assert.ok(minimums.length > 0, `${filename} 无法读取最低系统版本`)
  for (const minimum of minimums) {
    assert.ok(minimum, `${filename} 缺少最低系统版本`)
    assert.ok(
      versionNumber(minimum) <= versionNumber(profile.minimumSystemVersion),
      `${filename} 要求 macOS ${minimum}，超过档位 ${profile.minimumSystemVersion}`,
    )
  }
  checked += 1
}
assert.ok(checked > 0, '安装包中没有 Mach-O 文件')
process.stdout.write(`已检查 ${checked} 个 Mach-O：${architecture}，macOS ${declaredMinimum}+\n`)
