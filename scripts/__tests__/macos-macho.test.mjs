/**
 * 校验 Mac 打包用的 Mach-O 解析：thin / fat 容器都能按目标架构取出最低系统版本，
 * 并且不依赖 otool 对文件路径的处理。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  MACHO_CPU_TYPES,
  isMachOFile,
  readMachOMinimumSystemVersions,
} from '../lib/macos-macho.mjs'

const MH_MAGIC_64 = 0xfeedfacf
const FAT_MAGIC = 0xcafebabe
const LC_BUILD_VERSION = 0x32
const PLATFORM_MACOS = 1
const directory = mkdtempSync(join(tmpdir(), 'macos-macho-'))

/** 按字节序写入 32 位整数。 */
function writeU32(buffer, offset, value, endian) {
  if (endian === 'le') buffer.writeUInt32LE(value, offset)
  else buffer.writeUInt32BE(value, offset)
}

/** 把 "13.0.4" 打包成 Mach-O 的 major.minor.patch 位域。 */
function packedVersion(version) {
  const [major = 0, minor = 0, patch = 0] = version.split('.').map(Number)
  return (major << 16) | (minor << 8) | patch
}

/** 生成只带一条 LC_BUILD_VERSION 的 64 位 Mach-O 切片。 */
function machoSlice({ cputype, minimumSystemVersion, endian = 'le' }) {
  const buffer = Buffer.alloc(32 + 24)
  writeU32(buffer, 0, MH_MAGIC_64, endian)
  writeU32(buffer, 4, cputype, endian)
  writeU32(buffer, 8, 0, endian)
  writeU32(buffer, 12, 2, endian)
  writeU32(buffer, 16, 1, endian)
  writeU32(buffer, 20, 24, endian)
  writeU32(buffer, 24, 0, endian)
  writeU32(buffer, 28, 0, endian)
  writeU32(buffer, 32, LC_BUILD_VERSION, endian)
  writeU32(buffer, 36, 24, endian)
  writeU32(buffer, 40, PLATFORM_MACOS, endian)
  writeU32(buffer, 44, packedVersion(minimumSystemVersion), endian)
  writeU32(buffer, 48, 0, endian)
  writeU32(buffer, 52, 0, endian)
  return buffer
}

/** 生成 big-endian fat 容器；fat_arch 的偏移和长度按实际切片写入。 */
function fatBinary(slices) {
  const header = Buffer.alloc(8 + slices.length * 20)
  header.writeUInt32BE(FAT_MAGIC, 0)
  header.writeUInt32BE(slices.length, 4)
  let offset = header.length
  slices.forEach((slice, index) => {
    const entry = 8 + index * 20
    header.writeUInt32BE(slice.cputype, entry)
    header.writeUInt32BE(0, entry + 4)
    header.writeUInt32BE(offset, entry + 8)
    header.writeUInt32BE(slice.buffer.length, entry + 12)
    header.writeUInt32BE(0, entry + 16)
    offset += slice.buffer.length
  })
  return Buffer.concat([header, ...slices.map((slice) => slice.buffer)])
}

/** 把二进制写到临时目录并返回路径。 */
function writeBinary(name, buffer) {
  const file = join(directory, name)
  writeFileSync(file, buffer)
  return file
}

test('thin 切片按自身架构读出最低系统版本', () => {
  const file = writeBinary(
    'thin-arm64',
    machoSlice({ cputype: MACHO_CPU_TYPES.arm64, minimumSystemVersion: '13.0' }),
  )
  assert.equal(isMachOFile(file), true)
  assert.deepEqual(readMachOMinimumSystemVersions(file, MACHO_CPU_TYPES.arm64), ['13.0.0'])
})

test('big-endian 切片的头也能解析', () => {
  const file = writeBinary(
    'thin-x64-big-endian',
    machoSlice({
      cputype: MACHO_CPU_TYPES.x64,
      minimumSystemVersion: '11.2.1',
      endian: 'be',
    }),
  )
  assert.deepEqual(readMachOMinimumSystemVersions(file, MACHO_CPU_TYPES.x64), ['11.2.1'])
})

test('fat 容器按目标架构取对应切片的版本，不受兄弟切片影响', () => {
  const slices = [
    {
      cputype: MACHO_CPU_TYPES.x64,
      buffer: machoSlice({ cputype: MACHO_CPU_TYPES.x64, minimumSystemVersion: '10.15' }),
    },
    {
      cputype: MACHO_CPU_TYPES.arm64,
      buffer: machoSlice({ cputype: MACHO_CPU_TYPES.arm64, minimumSystemVersion: '13.0' }),
    },
  ]
  const file = writeBinary('fat', fatBinary(slices))
  assert.equal(isMachOFile(file), true)
  assert.deepEqual(readMachOMinimumSystemVersions(file, MACHO_CPU_TYPES.arm64), ['13.0.0'])
  assert.deepEqual(readMachOMinimumSystemVersions(file, MACHO_CPU_TYPES.x64), ['10.15.0'])
})

test('普通文件不当作 Mach-O', () => {
  const file = writeBinary('plain.txt', Buffer.from('not a binary'))
  assert.equal(isMachOFile(file), false)
})
