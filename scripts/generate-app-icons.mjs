/**
 * 应用图标生成：把品牌 SVG 渲染成 Electron 打包所需的多尺寸位图容器。
 *
 * 事实来源只有 packages/vue/src/workspace/assets/kcq-logo.svg，本脚本产出
 * packages/desktop-electron/build 下的 icon.png / icon.ico / icon.icns，
 * 避免同一枚图标在多处手绘后互相漂移。
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const brandSvgPath = path.join(repoRoot, 'packages/vue/src/workspace/assets/kcq-logo.svg')
const buildDir = path.join(repoRoot, 'packages/desktop-electron/build')

/** 品牌折线在 viewBox 中的原始描边宽度，与小尺寸替代值一起决定视觉重量。 */
const BRAND_STROKE_WIDTH = 16.8
/** 32px 及以下的图标改用更粗的折线，否则亚像素宽度会把两条轨迹糊成一团。 */
const SMALL_STROKE_WIDTH = 20
const SMALL_SIZE_LIMIT = 32
/** 光栅化的中间画布尺寸：一次性高分辨率渲染，再按需降采样，得到稳定的抗锯齿边缘。 */
const RASTER_SIZE = 1024

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
/** ICNS 条目型号：icp4/icp5 为 16/32 基础尺寸，ic07-ic10 为 128-1024，ic11-ic14 为 @2x。 */
const ICNS_ENTRIES = [
  { type: 'icp4', size: 16 },
  { type: 'ic11', size: 32 },
  { type: 'icp5', size: 32 },
  { type: 'ic12', size: 64 },
  { type: 'ic07', size: 128 },
  { type: 'ic13', size: 256 },
  { type: 'ic08', size: 256 },
  { type: 'ic09', size: 512 },
  { type: 'ic14', size: 512 },
  { type: 'ic10', size: 1024 },
]

const brandSvg = readFileSync(brandSvgPath, 'utf8')

/**
 * 生成指定描边宽度的 SVG 源文本。
 *
 * @param strokeWidth 折线描边宽度，取值域与 SVG 的 viewBox 一致
 * @returns 可直接交给 sharp 渲染的 SVG 文本
 */
function svgSource(strokeWidth) {
  return brandSvg.replace(/stroke-width="[\d.]+"/, `stroke-width="${strokeWidth}"`)
}

/** 每种描边宽度只光栅化一次，后续尺寸共享同一张高分辨率画布。 */
const rasterCache = new Map()

/**
 * 把品牌 SVG 渲染成指定边长的 PNG 位图。
 *
 * @param size 目标边长（像素）
 * @returns PNG 数据
 */
async function renderPng(size) {
  const strokeWidth = size <= SMALL_SIZE_LIMIT ? SMALL_STROKE_WIDTH : BRAND_STROKE_WIDTH
  let raster = rasterCache.get(strokeWidth)
  if (!raster) {
    raster = await sharp(Buffer.from(svgSource(strokeWidth)))
      .resize(RASTER_SIZE, RASTER_SIZE, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer()
    rasterCache.set(strokeWidth, raster)
  }
  if (size === RASTER_SIZE) return raster
  return sharp(raster).resize(size, size, { kernel: 'lanczos3' }).png().toBuffer()
}

/**
 * 组装 ICO 容器；每帧使用 PNG 负载，Windows Vista 起的 ico 解析器均支持。
 *
 * @param frames 尺寸与 PNG 数据，按尺寸升序给出
 * @returns 完整 ICO 文件内容
 */
function buildIco(frames) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(frames.length, 4)

  const directory = Buffer.alloc(16 * frames.length)
  let offset = header.length + directory.length
  frames.forEach(({ size, png }, index) => {
    const entry = index * 16
    // 256 在目录项里用 0 表示，因为宽高字段只有一个字节。
    directory.writeUInt8(size >= 256 ? 0 : size, entry)
    directory.writeUInt8(size >= 256 ? 0 : size, entry + 1)
    directory.writeUInt8(0, entry + 2)
    directory.writeUInt8(0, entry + 3)
    directory.writeUInt16LE(1, entry + 4)
    directory.writeUInt16LE(32, entry + 6)
    directory.writeUInt32LE(png.length, entry + 8)
    directory.writeUInt32LE(offset, entry + 12)
    offset += png.length
  })

  return Buffer.concat([header, directory, ...frames.map((frame) => frame.png)])
}

/**
 * 组装 ICNS 容器；PNG 负载自 macOS 10.7 起被原生支持，无需转换 TIFF/BMP。
 *
 * @param entries 条目型号与 PNG 数据
 * @returns 完整 ICNS 文件内容
 */
function buildIcns(entries) {
  const chunks = entries.map(({ type, png }) => {
    const header = Buffer.alloc(8)
    header.write(type, 0, 4, 'ascii')
    header.writeUInt32BE(png.length + 8, 4)
    return Buffer.concat([header, png])
  })
  const total = 8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const fileHeader = Buffer.alloc(8)
  fileHeader.write('icns', 0, 4, 'ascii')
  fileHeader.writeUInt32BE(total, 4)
  return Buffer.concat([fileHeader, ...chunks])
}

mkdirSync(buildDir, { recursive: true })

const icoFrames = []
for (const size of ICO_SIZES) icoFrames.push({ size, png: await renderPng(size) })
const icnsEntries = []
for (const entry of ICNS_ENTRIES)
  icnsEntries.push({ type: entry.type, png: await renderPng(entry.size) })

const pngPath = path.join(buildDir, 'icon.png')
const icoPath = path.join(buildDir, 'icon.ico')
const icnsPath = path.join(buildDir, 'icon.icns')

writeFileSync(pngPath, await renderPng(1024))
writeFileSync(icoPath, buildIco(icoFrames))
writeFileSync(icnsPath, buildIcns(icnsEntries))

console.log(`icon.png  1024x1024`)
console.log(`icon.ico  ${ICO_SIZES.join(', ')}`)
console.log(`icon.icns ${ICNS_ENTRIES.map((entry) => `${entry.type}:${entry.size}`).join(', ')}`)
