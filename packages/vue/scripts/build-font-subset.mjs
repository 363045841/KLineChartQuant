/**
 * build-font-subset.mjs
 *
 * 把随包的中文字体裁剪成界面实际需要的子集，并转成 WOFF2。
 *
 * 字符集 = ASCII + GBK 一级汉字（常用 3760 字）+ 界面标点 + 源码里出现的所有汉字。
 * 生僻字（例如个别品种名）不在子集内，由字体栈后面的系统字体兜底。
 *
 * 用法：pnpm --filter @363045841yyt/klinechart font:subset
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import subsetFont from 'subset-font'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const SOURCE_FONT = path.join(packageRoot, 'src/assets/fonts/HarmonyOS_Sans_SC_Medium.ttf')
const OUTPUT_FONT = path.join(packageRoot, 'src/assets/fonts/HarmonyOS_Sans_SC_Subset.woff2')

/** 子集必须覆盖的界面标点与符号。 */
const PUNCTUATION = '、。「」『』（）《》〈〉—…·～！？：；“”‘’【】'

/** 扫描目录里所有 .ts/.vue 文件，收集出现的汉字。 */
function collectSourceChars(dirs) {
  const chars = new Set()
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (!statSync(full).isFile()) continue
      if (!/\.(ts|vue)$/.test(entry.name)) continue
      for (const char of readFileSync(full, 'utf8')) {
        if (/\p{Script=Han}/u.test(char)) chars.add(char)
      }
    }
  }
  for (const dir of dirs) walk(dir)
  return [...chars].join('')
}

/** GBK 一级汉字（0xB0A1–0xD7F9），覆盖日常中文文本。 */
function gbkLevelOne() {
  const decoder = new TextDecoder('gbk')
  let text = ''
  for (let high = 0xb0; high <= 0xd7; high += 1) {
    for (let low = 0xa1; low <= 0xfe; low += 1) {
      const char = decoder.decode(new Uint8Array([high, low]))
      if (char.length === 1 && char !== '\uFFFD') text += char
    }
  }
  return text
}

/** ASCII 可打印字符。 */
function ascii() {
  let text = ''
  for (let code = 0x20; code <= 0x7e; code += 1) text += String.fromCharCode(code)
  return text
}

const sourceChars = collectSourceChars([
  path.join(packageRoot, 'src'),
  path.join(repoRoot, 'packages/core/src'),
])
const charset = `${ascii()}${gbkLevelOne()}${PUNCTUATION}${sourceChars}`
const unique = [...new Set(charset)].join('')

const source = readFileSync(SOURCE_FONT)
const subset = await subsetFont(source, unique, { targetFormat: 'woff2' })
writeFileSync(OUTPUT_FONT, subset)

const before = source.length / 1048576
const after = subset.length / 1048576
console.log(
  `[font-subset] ${unique.length} 字符：${before.toFixed(2)} MB (ttf) → ${after.toFixed(2)} MB (woff2)`,
)
