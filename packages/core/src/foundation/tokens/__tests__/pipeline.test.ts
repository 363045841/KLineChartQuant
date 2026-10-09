/**
 * DTCG → Style Dictionary 管线守卫。
 *
 *   1. 生成文件与源同步（等价于 `pnpm tokens:check`）。
 *   2. 每个 preset × mode 排列由 DTCG 构建出的 `--klc-*` CSS，与运行时
 *      `toCssDeclarationBlock(themeToCssVars(resolveTheme(...)))` 逐字节一致。
 *      这把 DTCG 中的预设映射（preset/visual-mapping.tokens.json）与
 *      `createVisualTheme` 锁成同一份事实；任何一侧单独改动都会在此失败。
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  camelToKebab,
  FOUNDATION_GROUPS,
  resolveTheme,
  THEME_PRESETS,
  type ThemePresetId,
  themeToCssVars,
  toCssDeclarationBlock,
} from '..'

const coreDir = fileURLToPath(new URL('../../../../', import.meta.url))
const buildScript = path.join(coreDir, 'scripts/tokens/build.mjs')
const dtcgDir = path.join(coreDir, 'src/foundation/tokens/dtcg')
const cssDir = path.join(coreDir, 'design-tokens/css')

const MODES = ['light', 'dark'] as const

function readThemeCss(preset: ThemePresetId, mode: 'light' | 'dark'): string {
  const text = fs.readFileSync(path.join(cssDir, `theme.${preset}.${mode}.css`), 'utf8')
  // 第一行是生成说明注释，其余应与运行时输出完全相同。
  return text.slice(text.indexOf('\n') + 1)
}

describe('design tokens pipeline', () => {
  it('generated files are in sync with the DTCG source (tokens:check)', () => {
    expect(() =>
      execFileSync(process.execPath, [buildScript, '--check'], { encoding: 'utf8', stdio: 'pipe' }),
    ).not.toThrow()
  })

  it('resolver declares the preset × mode modifiers and only existing sources', () => {
    const doc = JSON.parse(fs.readFileSync(path.join(dtcgDir, 'kcq.resolver.json'), 'utf8'))
    expect(doc.version).toBe('2025-10-01')
    expect(Object.keys(doc.modifiers.preset.contexts)).toEqual(THEME_PRESETS.map((p) => p.id))
    expect(Object.keys(doc.modifiers.mode.contexts)).toEqual(['light', 'dark'])
    const refs = [
      ...Object.values<{ sources: { $ref: string }[] }>(doc.sets).flatMap((s) => s.sources),
      ...Object.values<{ contexts: Record<string, { $ref: string }[]> }>(doc.modifiers).flatMap(
        (m) => Object.values(m.contexts).flat(),
      ),
    ].map((s) => s.$ref)
    for (const ref of refs) expect(fs.existsSync(path.join(dtcgDir, ref)), ref).toBe(true)
  })

  for (const { id } of THEME_PRESETS) {
    for (const mode of MODES) {
      it(`${id} × ${mode}: generated theme CSS equals runtime themeToCssVars`, () => {
        // 主题层单独比较：去掉 v2 foundation 后应与冻结的 Theme 输出逐字节一致。
        const { foundation: _foundation, ...runtime } = resolveTheme(mode, false, { preset: id })
        expect(readThemeCss(id, mode)).toBe(`${toCssDeclarationBlock(themeToCssVars(runtime))}\n`)
      })
    }
  }

  for (const mode of MODES) {
    it(`foundation.css (:root + [data-theme='${mode}']) equals runtime foundation vars`, () => {
      const css = fs.readFileSync(path.join(cssDir, 'foundation.css'), 'utf8')
      const blocks = new Map(
        [...css.matchAll(/^([^{\n]+) \{\n([\s\S]*?)\n\}/gm)].map((m) => [m[1], m[2]]),
      )
      const decls = [blocks.get(':root'), blocks.get(`[data-theme='${mode}']`)]
        .join('\n')
        .split('\n')
        .map((l) => l.trim().match(/^(--[\w-]+): (.*);$/))
        .filter((m): m is RegExpMatchArray => m !== null)
        .map((m) => [m[1], m[2]] as const)
      const theme = resolveTheme(mode)
      const all = themeToCssVars(theme)
      const legacy = themeToCssVars({ ...theme, foundation: undefined })
      const foundationVars = Object.fromEntries(Object.entries(all).filter(([k]) => !(k in legacy)))
      expect(Object.fromEntries(decls)).toEqual(foundationVars)
      // 运行时输出顺序遵循 FOUNDATION_GROUPS（与构建脚本同一顺序）。
      const groupOf = (name: string) =>
        FOUNDATION_GROUPS.findIndex((g) => name.startsWith(`--klc-${camelToKebab(g)}-`))
      const order = Object.keys(foundationVars).map(groupOf)
      expect(order).toEqual([...order].sort((a, b) => a - b))
    })
  }
})
