#!/usr/bin/env node
// 调色板生成器（提案，不接入主题）：每个 preset × mode 由三个输入 base / accent / contrast
// 在 OKLCH 中生成 Radix 12 级语义阶梯（craft-principles CP 1、CP 4；tooling.md §2）。
// 结果写入 design-tokens/proposals/，供 Phase 3 评审；运行时主题不读取它们。
//
//   pnpm tokens:palettes            重新生成提案（写入 design-tokens/proposals/，不入库）
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Color from 'colorjs.io'
import { converter, formatHex, toGamut } from 'culori'
import { CHROMATIC, NEUTRAL, RADIX_SOURCE } from './lib/radix-reference.mjs'
import { CORE_DIR, loadResolver, permutations, resolveTokens } from './lib/resolver.mjs'
import { exportTokens } from './lib/style-dictionary.mjs'

const OUT_DIR = path.join(CORE_DIR, 'design-tokens/proposals')
const BRAND_ACCENT = '#4C77C6' // ADR 0007

const toOklch = converter('oklch')
const toRgb = toGamut('rgb', 'oklch')
const hex = (c) => formatHex(toRgb(c)).toUpperCase()
const clamp01 = (x) => Math.min(1, Math.max(0, x))
const r = (n, d = 3) => Number(n.toFixed(d))

export const wcag = (a, b) => Color.contrastWCAG21(a, b)
/** APCA Lc（背景在前）；符号表示极性，比较时取绝对值。 */
export const apca = (bg, fg) => Color.contrastAPCA(bg, fg)

const STEP_JOBS = [
  'app background',
  'subtle background',
  'element background',
  'hovered element',
  'active / selected element',
  'subtle border, separator',
  'element border, focus ring',
  'hovered border',
  'solid background',
  'hovered solid',
  'low-contrast text',
  'high-contrast text',
]

const refProfile = (list) => list.map((h) => toOklch(h))

/**
 * Radix 保证 step 11 / 12 在 step 2 上达到 APCA Lc 60 / 90（S20）；CI 门槛是 WCAG AA，
 * 所以同时要求 ≥ 4.5:1（黄色系 Lc 60 时仍可能低于 4.5:1）。
 * 不足时沿明度向外推（浅色变暗、深色变亮），彩度交给 gamut 映射收敛。
 */
function enforceTextSteps(steps, mode) {
  const bg = hex(steps[1])
  const dir = mode === 'light' ? -1 : 1
  const ok = (c, lc) => Math.abs(apca(bg, hex(c))) >= lc && wcag(hex(c), bg) >= 4.5
  for (const [i, target] of [
    [10, 60],
    [11, 90],
  ]) {
    const c = { ...steps[i] }
    for (let n = 0; n < 200 && !ok(c, target); n++) {
      const next = clamp01(c.l + dir * 0.005)
      if (next === c.l) break
      c.l = next
    }
    steps[i] = c
  }
  return steps
}

const hueDistance = (a = 0, b = 0) => {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

/**
 * neutralTint 取值（design §4 契约：'accent' | 'pure'）。提案规则 [derived]：
 * 当前底色已偏向强调色色相（≤ 45°，且有可见彩度）时保留 'accent'，否则取 'pure'，
 * 即保持各预设今天的中性色性格（CP 3）。
 */
export function proposeNeutralTint(base, accent) {
  const b = toOklch(base)
  const a = toOklch(accent)
  return (b.c ?? 0) >= 0.005 && hueDistance(b.h, a.h) <= 45 ? 'accent' : 'pure'
}

/** 中性阶梯：step 1 = base；其余按 Radix gray 相对 step 1 的明度差 × contrast。 */
export function neutralScale({ base, accent, contrast, neutralTint }, mode) {
  const ref = refProfile(NEUTRAL[mode])
  const b = toOklch(base)
  const a = toOklch(accent)
  const c = neutralTint === 'pure' ? 0 : (b.c ?? 0)
  const h = neutralTint === 'accent' ? (a.h ?? 0) : (b.h ?? 0)
  const steps = ref.map((s) => ({
    mode: 'oklch',
    l: clamp01(b.l + (s.l - ref[0].l) * contrast),
    c,
    h,
  }))
  return enforceTextSteps(steps, mode).map(hex)
}

/**
 * 彩色阶梯：step 9 = 锚点原色；1–8 在 base 明度与锚点明度之间按 Radix blue 的相对位置插值；
 * 10–12 取 Radix 相对 step 9 的明度差 × contrast；彩度按 Radix 彩度轮廓缩放，色相固定。
 */
export function chromaticScale(anchor, { base, contrast }, mode) {
  const ref = refProfile(CHROMATIC[mode])
  const a = toOklch(anchor)
  const baseL = toOklch(base).l
  const span = ref[8].l - ref[0].l
  const steps = ref.map((s, i) => {
    const l =
      i <= 8 ? baseL + ((s.l - ref[0].l) / span) * (a.l - baseL) : a.l + (s.l - ref[8].l) * contrast
    return { mode: 'oklch', l: clamp01(l), c: (a.c ?? 0) * (s.c / ref[8].c), h: a.h ?? 0 }
  })
  const out = enforceTextSteps(steps, mode).map(hex)
  out[8] = anchor.toUpperCase()
  return out
}

/** 从当前已解析的主题读取每个排列的输入与锚点。 */
async function readInputs() {
  const resolver = loadResolver()
  const out = []
  for (const input of permutations(resolver)) {
    const t = await exportTokens(resolveTokens(resolver, input))
    const v = (p) => p.split('.').reduce((n, k) => n[k], t).$value
    const base = v('color.ui.background')
    const accent = v('color.ui.accent')
    out.push({
      ...input,
      inputs: { base, accent, contrast: 1, neutralTint: proposeNeutralTint(base, accent) },
      anchors: {
        brand: BRAND_ACCENT,
        up: v('color.candleUpBody'),
        down: v('color.candleDownBody'),
        warning: v('color.ui.warning'),
        danger: v('color.ui.danger'),
      },
    })
  }
  return out
}

function checks(scales) {
  const n = scales.neutral
  const rows = [
    { pair: 'neutral 12 on neutral 1', fg: n[11], bg: n[0], min: 7 },
    { pair: 'neutral 11 on neutral 2', fg: n[10], bg: n[1], min: 4.5 },
  ]
  for (const name of ['accent', 'brand', 'up', 'down', 'warning', 'danger']) {
    const s = scales[name]
    rows.push({ pair: `${name} 9 on neutral 1`, fg: s[8], bg: n[0], min: 3 })
    rows.push({ pair: `${name} 11 on neutral 2`, fg: s[10], bg: n[1], min: 4.5 })
  }
  return rows.map((row) => {
    const ratio = wcag(row.fg, row.bg)
    return {
      ...row,
      wcag: r(ratio, 2),
      apca: r(apca(row.bg, row.fg), 1),
      pass: ratio >= row.min,
    }
  })
}

export async function generate() {
  const proposals = []
  for (const p of await readInputs()) {
    const scales = { neutral: neutralScale(p.inputs, p.mode) }
    for (const [name, anchor] of Object.entries({ accent: p.inputs.accent, ...p.anchors }))
      scales[name] = chromaticScale(anchor, p.inputs, p.mode)
    proposals.push({
      preset: p.preset,
      mode: p.mode,
      inputs: p.inputs,
      scales,
      checks: checks(scales),
    })
  }
  const json = {
    $comment:
      'Generated by `pnpm tokens:palettes`. PROPOSALS ONLY: not wired into any theme (Phase 3 applies them after review).',
    method: {
      model:
        'Three inputs per preset x mode (base, accent, contrast) generate Radix 12-step scales in OKLCH (CP 1, CP 4; S12 Linear, S20 Radix, S24 OKLCH).',
      reference: RADIX_SOURCE,
      neutral:
        'step 1 = base; steps 2-12 = base L + (Radix gray ΔL from step 1) x contrast. Chroma = base chroma toward the accent hue (neutralTint accent) or 0 (pure). [derived]',
      chromatic:
        'step 9 = anchor; steps 1-8 interpolate L from base to anchor at Radix blue relative positions; steps 10-12 = anchor L + Radix ΔL x contrast; chroma follows the Radix chroma profile. [derived]',
      textSteps:
        'Steps 11 / 12 are pushed outward in L until APCA Lc 60 / 90 on step 2 (the Radix guarantee, S20) and WCAG ≥ 4.5:1 (the CI gate).',
      gamut: 'culori toGamut(rgb, oklch); sRGB hex output.',
      neutralTint:
        "Proposal rule [derived]: accent when today's base already leans to the accent hue (≤ 45°, chroma ≥ 0.005), else pure (CP 3).",
      stepJobs: STEP_JOBS,
    },
    proposals,
  }
  return { json: `${JSON.stringify(json, null, 2)}\n`, md: renderMarkdown(proposals) }
}

function renderMarkdown(proposals) {
  const lines = [
    '<!-- Generated by `pnpm tokens:palettes`. Do not edit. -->',
    '# Palette proposals (not applied)',
    '',
    'Radix 12-step scales generated in OKLCH from three inputs per preset × mode: `base`, `accent`, `contrast` (craft-principles CP 1, CP 4; tooling.md §2). These are **proposals for Phase 3 review**: no theme reads them, and canvas colors are unchanged.',
    '',
    `Method: lightness/chroma profile from ${RADIX_SOURCE}; step 1 = base, step 9 = anchor, steps 11/12 pushed to APCA Lc 60/90 on step 2 (S20) and WCAG ≥ 4.5:1. Interpolation and the neutralTint rule are [derived]; see palettes.json \`method\`.`,
    '',
    `Step jobs: ${STEP_JOBS.map((j, i) => `${i + 1} ${j}`).join(' · ')}.`,
    '',
  ]
  for (const p of proposals) {
    const i = p.inputs
    lines.push(`## ${p.preset} · ${p.mode}`, '')
    lines.push(
      `Inputs: base \`${i.base}\`, accent \`${i.accent}\`, contrast ${i.contrast}, neutralTint \`${i.neutralTint}\`.`,
      '',
    )
    lines.push(`| scale | ${Array.from({ length: 12 }, (_, k) => k + 1).join(' | ')} |`)
    lines.push(`|---|${'---|'.repeat(12)}`)
    for (const [name, s] of Object.entries(p.scales)) lines.push(`| ${name} | ${s.join(' | ')} |`)
    lines.push('', '| check | WCAG | floor | APCA Lc | pass |', '|---|---|---|---|---|')
    for (const c of p.checks)
      lines.push(
        `| ${c.pair} | ${c.wcag} | ${c.min}:1 | ${c.apca} | ${c.pass ? 'yes' : '**no**'} |`,
      )
    lines.push('')
  }
  return lines.join('\n')
}

async function main() {
  const { json, md } = await generate()
  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.writeFileSync(path.join(OUT_DIR, 'palettes.json'), json)
  fs.writeFileSync(path.join(OUT_DIR, 'palettes.md'), md)
  process.stdout.write('tokens:palettes — proposals written to design-tokens/proposals/.\n')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
