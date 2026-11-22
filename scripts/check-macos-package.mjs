/**
 * 校验 Mac 产物的架构与最低系统，避免只改 plist 的假兼容包。
 * Mach-O 头由 scripts/lib/macos-macho.mjs 直接解析，不经 otool / lipo，
 * 否则 Electron helper app 路径里的 "(GPU)" 会被当成库成员语法截断。
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  MACHO_CPU_TYPES,
  isMachOFile,
  readMachOMinimumSystemVersions,
} from './lib/macos-macho.mjs'

const outputDirectory = resolve(process.argv[2])
const minimumSystemVersion = process.argv[3]
const architecture = process.argv[4]
assert.ok(minimumSystemVersion, '请指定最低 macOS 版本')
assert.ok(architecture in MACHO_CPU_TYPES, '请指定 x64 或 arm64')
const cpuType = MACHO_CPU_TYPES[architecture]
const app = findAppBundle(outputDirectory)

/** 在 electron-builder 输出目录里找到唯一的 .app；产品名由打包配置决定，不在这里硬编码。 */
function findAppBundle(directory) {
  const bundles = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith('.app'))
    .map((entry) => join(directory, entry.name))
  assert.equal(bundles.length, 1, `${directory} 应当恰好包含一个 .app`)
  return bundles[0]
}

/** 把 macOS 版本转成可比较数值；段数不固定，缺省补 0。 */
function versionNumber(version) {
  const [major = 0, minor = 0, patch = 0] = version.split('.').map(Number)
  return major * 1_000_000 + minor * 1_000 + patch
}

/** 调用系统自带的 plist 工具，失败直接阻止上传产物。 */
function capture(command, args) {
  return execFileSync(command, args, { encoding: 'utf8' }).trim()
}

/** 递归遍历实际文件；符号链接（如 Framework 的 Versions/Current）跳过，避免重复检查。 */
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
assert.equal(declaredMinimum, minimumSystemVersion)

let checked = 0
for (const filename of files(app)) {
  if (!isMachOFile(filename)) continue
  const minimums = readMachOMinimumSystemVersions(filename, cpuType)
  assert.ok(minimums.length > 0, `${filename} 无法读取最低系统版本`)
  for (const minimum of minimums) {
    assert.ok(
      versionNumber(minimum) <= versionNumber(minimumSystemVersion),
      `${filename} 要求 macOS ${minimum}，超过 ${minimumSystemVersion}`,
    )
  }
  checked += 1
}
assert.ok(checked > 0, '安装包中没有 Mach-O 文件')
process.stdout.write(`已检查 ${checked} 个 Mach-O：${architecture}，macOS ${declaredMinimum}+\n`)
