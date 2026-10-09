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
      it(`${id} × ${mode}: generated CSS equals runtime themeToCssVars`, () => {
        const runtime = resolveTheme(mode, false, { preset: id })
        expect(readThemeCss(id, mode)).toBe(`${toCssDeclarationBlock(themeToCssVars(runtime))}\n`)
      })
    }
  }
})
