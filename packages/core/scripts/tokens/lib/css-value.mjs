// DTCG 2025.10 值 → CSS 文本。构建、调色板生成与对比度审计共用同一套序列化规则。

/** 本仓库的 DTCG `$extensions` 命名空间（反向域名，取自项目主页 363045841.github.io）。 */
export const EXT = 'io.github.363045841.kcq'

/** 与 themeToCssVars 的 camelToKebab 逐字一致，保证变量名不漂移。 */
export function camelToKebab(s) {
  return s.replace(/[A-Z]/g, (m, i) => (i === 0 ? m.toLowerCase() : `-${m.toLowerCase()}`))
}

export function cssVarName(path, prefix = '--klc-') {
  return prefix + path.map(camelToKebab).join('-')
}

const round = (n, d) => Number(n.toFixed(d))

/**
 * 颜色对象序列化。`$extensions[EXT].css` 记录作者原文（如 `rgba(34, 214, 155, 0.20)`），
 * 存在时原样输出，保证迁移逐字节一致；否则 sRGB 走 `hex` 回退 + 两位 alpha，
 * 其他色彩空间输出 CSS Color 4 函数写法。
 */
export function formatColor(value, extensions) {
  const authored = extensions?.[EXT]?.css
  if (authored) return authored
  if (typeof value === 'string') return value
  const alpha = value.alpha ?? 1
  const { colorSpace, components: c } = value
  if (colorSpace === 'srgb' && value.hex) {
    if (alpha === 1) return value.hex
    const a = Math.round(alpha * 255)
      .toString(16)
      .padStart(2, '0')
    return value.hex + (/[a-f]/.test(value.hex) ? a : a.toUpperCase())
  }
  const tail = alpha === 1 ? '' : ` / ${round(alpha, 3)}`
  if (colorSpace === 'hsl') return `hsl(${c[0]} ${c[1]}% ${c[2]}%${tail})`
  if (colorSpace === 'oklch')
    return `oklch(${round(c[0], 4)} ${round(c[1], 4)} ${round(c[2], 2)}${tail})`
  throw new Error(`formatColor: unsupported colorSpace ${colorSpace}`)
}

/** 0 输出无单位 `0`（与既有 spacing.none 一致）；其余为 `<value><unit>`。 */
export function formatDimension(v) {
  if (typeof v === 'string') return v
  return v.value === 0 ? '0' : `${v.value}${v.unit}`
}

export function formatDuration(v) {
  return typeof v === 'string' ? v : `${v.value}${v.unit}`
}

const GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'math',
  'emoji',
  'fangsong',
])

export function formatFontFamily(v) {
  if (typeof v === 'string') return v
  return v.map((f) => (/\s/.test(f) && !GENERIC_FAMILIES.has(f) ? `'${f}'` : f)).join(', ')
}

function formatShadowLayer(l) {
  const parts = [formatDimension(l.offsetX), formatDimension(l.offsetY), formatDimension(l.blur)]
  const spread = formatDimension(l.spread ?? '0')
  if (spread !== '0') parts.push(spread)
  return `${l.inset ? 'inset ' : ''}${parts.join(' ')} ${formatColor(l.color)}`
}

/**
 * 按 `$type` 序列化。fontWeight / number 保留数值类型（TS 生成需要数字字面量），
 * CSS 输出时再 `String()`。已是字符串的值视为上游已转换（别名解析后的传递调用）。
 */
export function cssValue(type, value, extensions) {
  switch (type) {
    case 'color':
      return formatColor(value, extensions)
    case 'dimension':
      return formatDimension(value)
    case 'duration':
      return formatDuration(value)
    case 'cubicBezier':
      return typeof value === 'string' ? value : `cubic-bezier(${value.join(', ')})`
    case 'fontFamily':
      return formatFontFamily(value)
    case 'shadow':
      if (typeof value === 'string') return value
      return (Array.isArray(value) ? value : [value]).map(formatShadowLayer).join(', ')
    case 'number': {
      // DTCG dimension 只允许 px/rem；em 字距以 number + `$extensions[EXT].unit` 表达。
      const unit = extensions?.[EXT]?.unit
      if (unit && typeof value === 'number') return value === 0 ? '0' : `${value}${unit}`
      return value
    }
    case 'fontWeight':
      return value
    default:
      if (typeof value === 'string' || typeof value === 'number') return value
      throw new Error(`cssValue: unsupported $type ${type}`)
  }
}
