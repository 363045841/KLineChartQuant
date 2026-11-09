/** 检查 Intel 兼容包的 Info.plist、所有 Mach-O 最低系统版本和实际 Electron 运行时。 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { closeSync, openSync, readdirSync, readSync } from 'node:fs'
import { join, resolve } from 'node:path'

const app = resolve(process.argv[2])
const minimumSystem = '12.0'
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

/** 将系统版本转为可比较的数值，保留次版本和修订版本。 */
function versionNumber(version) {
  const [major, minor = 0, patch = 0] = version.split('.').map(Number)
  return major * 1_000_000 + minor * 1_000 + patch
}

/** 调用 macOS 自带工具，失败直接阻止交付。 */
function capture(command, args, options = {}) {
  return execFileSync(command, args, { encoding: 'utf8', ...options }).trim()
}

/** 遍历实际文件，跳过 Framework 符号链接，避免重复检查同一二进制。 */
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
assert.equal(declaredMinimum, minimumSystem)
console.log(`Info.plist minimum: ${declaredMinimum}`)

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
  const architectures = capture('lipo', ['-archs', filename]).split(/\s+/)
  assert.ok(architectures.includes('x86_64'), `缺少 Intel 架构：${filename}`)
  const commands = capture('otool', ['-l', filename]).split(/Load command \d+/)
  const minimums = commands
    .filter((command) => /cmd LC_(BUILD_VERSION|VERSION_MIN_MACOSX)\b/.test(command))
    .map((command) => command.match(/\b(?:minos|version)\s+(\d+(?:\.\d+){0,2})/)?.[1])
  assert.ok(minimums.length > 0, `无法读取最低系统版本：${filename}`)
  for (const minimum of minimums) {
    assert.ok(minimum, `缺少最低系统版本：${filename}`)
    assert.ok(versionNumber(minimum) <= versionNumber(minimumSystem), `${filename} 要求 ${minimum}`)
  }
  checked += 1
  console.log(`Mach-O ${minimums.join('/')} ${filename}`)
}
assert.ok(checked > 0, '安装包中没有 Mach-O 文件')

const executable = join(app, 'Contents/MacOS/KLineChart Quant')
const versions = JSON.parse(
  capture(executable, ['-p', 'JSON.stringify(process.versions)'], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  }),
)
assert.equal(versions.electron, '43.8.7')
console.log(`Checked ${checked} Mach-O files; Electron ${versions.electron}, Node ${versions.node}`)
