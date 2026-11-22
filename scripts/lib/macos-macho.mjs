/**
 * macos-macho.mjs
 *
 * 直接解析 Mach-O / fat 二进制头，为 Mac 打包校验提供目标架构与最低系统版本。
 *
 * 不用 otool / lipo：它们把路径里的 "(...)" 当作静态库成员语法，
 * Electron 的 "KLineChart Quant Helper (GPU)" 一类路径会被截断成不存在的文件，
 * 导致整个 arm64 / x64 产物校验失败。自解析还省掉对 Xcode 命令行工具的依赖。
 */

import assert from 'node:assert/strict'
import { closeSync, openSync, readSync } from 'node:fs'

/** Mach-O 头魔数（thin）。 */
const MH_MAGIC = 0xfeedface
const MH_MAGIC_64 = 0xfeedfacf
/** fat 头魔数；带 64 位条目的是 FAT_MAGIC_64。 */
const FAT_MAGIC = 0xcafebabe
const FAT_MAGIC_64 = 0xcafebabf
/** thin 头在两种字节序下的原始读数，用于识别非 Mach-O 文件。 */
const SWAPPED_MH_MAGIC = 0xcefaedfe
const SWAPPED_MH_MAGIC_64 = 0xcffaedfe
const SWAPPED_FAT_MAGIC = 0xbebafeca
const SWAPPED_FAT_MAGIC_64 = 0xbfbafeca
/** 需要读取的 load command。 */
const LC_VERSION_MIN_MACOSX = 0x24
const LC_BUILD_VERSION = 0x32
const PLATFORM_MACOS = 1

/** 打包架构名到 Mach-O cputype 的映射，CLI 只接受这两个值。 */
export const MACHO_CPU_TYPES = { x64: 0x01000007, arm64: 0x0100000c }

/** cputype 到可读名称，失败信息里用。 */
const CPU_TYPE_NAMES = new Map([
  [MACHO_CPU_TYPES.x64, 'x86_64'],
  [MACHO_CPU_TYPES.arm64, 'arm64'],
])

/** 从文件读取指定长度的字节；越界视为产物损坏。 */
function readAt(descriptor, offset, length) {
  const buffer = Buffer.alloc(length)
  const read = readSync(descriptor, buffer, 0, length, offset)
  assert.equal(read, length, `文件在偏移 ${offset} 处提前结束`)
  return buffer
}

/** 按头 4 字节判断字节序：小端存储的规范魔数会被读成已知值。 */
function endianOf(buffer, offset = 0) {
  const magic = buffer.readUInt32LE(offset)
  const known = [MH_MAGIC, MH_MAGIC_64, FAT_MAGIC, FAT_MAGIC_64]
  return known.includes(magic) ? 'le' : 'be'
}

/** 按字节序读取 32 位整数。 */
function readU32(buffer, offset, endian) {
  return endian === 'le' ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset)
}

/** 按字节序读取 64 位整数；文件偏移不会超过 Number 安全范围。 */
function readU64(buffer, offset, endian) {
  return Number(
    endian === 'le' ? buffer.readBigUInt64LE(offset) : buffer.readBigUInt64BE(offset),
  )
}

/** 把 Mach-O 头里的压缩版本号还原成 major.minor.patch。 */
function formatPackedVersion(value) {
  return `${value >>> 16}.${(value >>> 8) & 0xff}.${value & 0xff}`
}

/** 读取切片头：cputype、字节序、load command 的位置与长度。 */
function readSliceHeader(descriptor, offset) {
  const header = readAt(descriptor, offset, 32)
  const endian = endianOf(header)
  const magic = readU32(header, 0, endian)
  assert.ok(
    magic === MH_MAGIC || magic === MH_MAGIC_64,
    `偏移 ${offset} 处不是 Mach-O 头`,
  )
  return {
    cputype: readU32(header, 4, endian),
    endian,
    // 32 位头 28 字节，64 位头 32 字节；ncmds / sizeofcmds 偏移一致。
    commandsOffset: offset + (magic === MH_MAGIC_64 ? 32 : 28),
    commandCount: readU32(header, 16, endian),
    commandBytes: readU32(header, 20, endian),
  }
}

/** 列出 fat 二进制里的每个切片：目标 cputype 与它在文件中的偏移。 */
function readFatSlices(descriptor, endian, is64) {
  const head = readAt(descriptor, 0, 8)
  const count = readU32(head, 4, endian)
  const entrySize = is64 ? 32 : 20
  const table = readAt(descriptor, 8, count * entrySize)
  return Array.from({ length: count }, (_, index) => {
    const base = index * entrySize
    return {
      cputype: readU32(table, base, endian),
      offset: is64 ? readU64(table, base + 8, endian) : readU32(table, base + 8, endian),
    }
  })
}

/** 读取切片声明的全部 macOS 最低版本；其他平台的 build version 不算数。 */
function readSliceMinimumSystemVersions(descriptor, offset) {
  const header = readSliceHeader(descriptor, offset)
  const commands = readAt(descriptor, header.commandsOffset, header.commandBytes)
  const minimums = []
  let cursor = 0
  for (let index = 0; index < header.commandCount; index += 1) {
    assert.ok(cursor + 8 <= commands.length, `偏移 ${offset} 的 load command 越界`)
    const command = readU32(commands, cursor, header.endian)
    const size = readU32(commands, cursor + 4, header.endian)
    assert.ok(
      size >= 8 && cursor + size <= commands.length,
      `偏移 ${offset} 的 load command 长度非法`,
    )
    if (command === LC_BUILD_VERSION) {
      const platform = readU32(commands, cursor + 8, header.endian)
      if (platform === PLATFORM_MACOS) {
        minimums.push(formatPackedVersion(readU32(commands, cursor + 12, header.endian)))
      }
    } else if (command === LC_VERSION_MIN_MACOSX) {
      minimums.push(formatPackedVersion(readU32(commands, cursor + 8, header.endian)))
    }
    cursor += size
  }
  return minimums
}

/**
 * 判断文件是否为 Mach-O（thin 或 fat）。
 * 只读前 4 字节，供遍历安装包时快速跳过 plist、asar、Go 源码等文件。
 *
 * @param {string} filePath 待检查的文件路径
 * @returns {boolean} 是 Mach-O 容器时为 true
 */
export function isMachOFile(filePath) {
  const descriptor = openSync(filePath, 'r')
  try {
    const head = Buffer.alloc(4)
    // 空文件或短文件不是 Mach-O，不能因为读不满 4 字节就中断整包校验。
    if (readSync(descriptor, head, 0, head.length, 0) !== head.length) return false
    const magic = head.readUInt32BE(0)
    return [
      MH_MAGIC,
      MH_MAGIC_64,
      SWAPPED_MH_MAGIC,
      SWAPPED_MH_MAGIC_64,
      FAT_MAGIC,
      FAT_MAGIC_64,
      SWAPPED_FAT_MAGIC,
      SWAPPED_FAT_MAGIC_64,
    ].includes(magic)
  } finally {
    closeSync(descriptor)
  }
}

/**
 * 读取指定架构切片声明的 macOS 最低版本。
 * 文件是 thin 时校验它本身，是 fat 时取 cputype 匹配的切片；缺少该架构直接失败，
 * 避免把单架构产物当成通包上传。
 *
 * @param {string} filePath Mach-O 或 fat 文件路径
 * @param {number} cputype 目标架构的 cputype，取自 MACHO_CPU_TYPES
 * @returns {string[]} 该切片声明的全部最低系统版本，形如 "13.0.0"
 */
export function readMachOMinimumSystemVersions(filePath, cputype) {
  const name = CPU_TYPE_NAMES.get(cputype) ?? `0x${cputype.toString(16)}`
  const descriptor = openSync(filePath, 'r')
  try {
    const head = readAt(descriptor, 0, 8)
    const endian = endianOf(head)
    const magic = readU32(head, 0, endian)
    const isFat = magic === FAT_MAGIC || magic === FAT_MAGIC_64
    const slices = isFat
      ? readFatSlices(descriptor, endian, magic === FAT_MAGIC_64)
      : [{ cputype: readSliceHeader(descriptor, 0).cputype, offset: 0 }]
    const slice = slices.find((item) => item.cputype === cputype)
    assert.ok(slice, `${filePath} 缺少 ${name}`)
    return readSliceMinimumSystemVersions(descriptor, slice.offset)
  } finally {
    closeSync(descriptor)
  }
}
