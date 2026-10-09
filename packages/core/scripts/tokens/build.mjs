#!/usr/bin/env node
// 设计 Token 构建：DTCG 2025.10 源 + 解析器 → 每个 preset × mode 排列经 Style Dictionary v5
// 解析，输出 --klc-* CSS、TS Theme 源文件、DTCG 解析器包。
//
//   pnpm tokens:build          写入全部生成文件
//   pnpm tokens:check          只校验，生成结果与磁盘不一致时退出码 1（CI / 测试使用）
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  bundleResolver,
  emitInterfaceColorsTs,
  emitThemeBaseTs,
  emitThemeCss,
  emitThemeTs,
  emitVisualPalettesTs,
} from './lib/emit.mjs'
import { stringifyTokens } from './lib/json.mjs'
import {
  buildModeSelector,
  CORE_DIR,
  DTCG_DIR,
  loadResolver,
  MODES,
  permutations,
  readJson,
  resolveTokens,
  TOKENS_DIR,
  walkTokens,
} from './lib/resolver.mjs'
import { exportTokens } from './lib/style-dictionary.mjs'

export const OUT_DIR = path.join(CORE_DIR, 'design-tokens')
const REPO_ROOT = path.resolve(CORE_DIR, '../..')
const BIOME = path.join(REPO_ROOT, 'node_modules/.bin/biome')

/** 交给 biome 规范化，保证生成文件与手写文件同一格式、`biome check` 通过。 */
function biomeFormat(file, content) {
  return execFileSync(BIOME, ['format', `--stdin-file-path=${file}`], {
    input: content,
    encoding: 'utf8',
    cwd: REPO_ROOT,
  })
}

/**
 * 计算全部输出（绝对路径 → 内容），不写盘。
 * 同时返回各排列的解析结果，供调色板生成与测试复用。
 */
export async function buildAll() {
  const outputs = new Map()
  const resolver = loadResolver()

  // 1. mode 选择器由 scheme 推导，先放入内存覆盖，排列解析使用最新版本。
  resolver.overrides = new Map()
  for (const mode of MODES) {
    const scheme = readJson(path.join(DTCG_DIR, `scheme/${mode}.tokens.json`))
    const selector = buildModeSelector(mode, scheme)
    const rel = `mode/${mode}.tokens.json`
    resolver.overrides.set(rel, selector)
    const file = path.join(DTCG_DIR, rel)
    outputs.set(file, biomeFormat(file, stringifyTokens(selector)))
  }

  // 2. Theme 契约内的路径：color.* 与 theme-base 声明的 spacing/typography/motion 键。
  const themeBaseDoc = readJson(path.join(DTCG_DIR, 'foundation/theme-base.tokens.json'))
  const themeBasePaths = new Set([...walkTokens(themeBaseDoc)].map(([p]) => p.join('.')))
  const isThemePath = (p) => p[0] === 'color' || themeBasePaths.has(p.join('.'))

  // 3. 逐排列解析。
  const results = []
  for (const input of permutations(resolver)) {
    const raw = resolveTokens(resolver, input)
    const sdTree = await exportTokens(raw)
    results.push({ input, raw, sdTree })
    const css = path.join(OUT_DIR, `css/theme.${input.preset}.${input.mode}.css`)
    outputs.set(css, emitThemeCss(input, sdTree, isThemePath))
  }
  const find = (preset, mode) =>
    results.find((r) => r.input.preset === preset && r.input.mode === mode)

  // 4. TS Theme 源文件（Pro 排列同时携带两种 mode 的 scheme 分支）。
  const pro = find('pro', 'dark')
  const ts = (rel, content) => {
    const file = path.join(TOKENS_DIR, rel)
    outputs.set(file, biomeFormat(file, content))
  }
  ts('theme-base.ts', emitThemeBaseTs(pro.raw, pro.sdTree, themeBaseDoc))
  ts('interface-colors.ts', emitInterfaceColorsTs(pro.raw, pro.sdTree))
  for (const mode of MODES) ts(`theme-${mode}.ts`, emitThemeTs(mode, pro.raw, pro.sdTree))
  const visual = Object.keys(resolver.doc.modifiers.preset.contexts)
    .filter((id) => id !== 'pro')
    .map((id) => ({
      id,
      description: readJson(path.join(DTCG_DIR, `preset/${id}.tokens.json`)).$description,
      ...find(id, 'dark'),
    }))
  ts('presets/impl/visualPalettes.ts', emitVisualPalettesTs(visual))

  // 5. 自包含的 DTCG 解析器包，供 nebutra-sailor 等外部消费方使用。
  const bundle = bundleResolver(
    resolver.doc,
    (ref) => resolver.overrides.get(ref) ?? readJson(path.join(DTCG_DIR, ref)),
  )
  outputs.set(path.join(OUT_DIR, 'dtcg/kcq.bundle.resolver.json'), stringifyTokens(bundle, 120))

  return { outputs, results }
}

async function main() {
  const check = process.argv.includes('--check')
  const { outputs } = await buildAll()
  const stale = []
  for (const [file, content] of outputs) {
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null
    if (current === content) continue
    stale.push(path.relative(REPO_ROOT, file))
    if (!check) {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, content)
    }
  }
  if (check && stale.length) {
    process.stderr.write(
      `tokens:check — ${stale.length} generated file(s) out of date:\n${stale.map((f) => `  ${f}\n`).join('')}Run \`pnpm tokens:build\` and commit the result.\n`,
    )
    process.exit(1)
  }
  process.stdout.write(
    check
      ? `tokens:check — ${outputs.size} generated files up to date.\n`
      : `tokens:build — ${outputs.size} files, ${stale.length} updated.\n`,
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
