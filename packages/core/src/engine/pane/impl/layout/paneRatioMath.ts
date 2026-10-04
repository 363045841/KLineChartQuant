export type PaneRatioSpec = {
  id: string
  visible?: boolean
  ratio?: number
}

/**
 * 将可见 pane 的 ratio 归一化为和为 1；隐藏 pane 保留原始 ratio 不参与归一化。
 */
export function normalizeVisiblePaneRatios(
  specs: ReadonlyArray<PaneRatioSpec>,
  ratios: Readonly<Record<string, number>>,
): Record<string, number> {
  const next: Record<string, number> = { ...ratios }
  const visible = specs.filter((p) => p.visible !== false)
  if (visible.length === 0) return next

  let sum = 0
  for (const spec of visible) {
    const raw = next[spec.id] ?? spec.ratio ?? 0
    const safe = Number.isFinite(raw) && raw > 0 ? raw : 0
    next[spec.id] = safe
    sum += safe
  }

  if (sum <= 0) {
    const equal = 1 / visible.length
    for (const spec of visible) {
      next[spec.id] = equal
    }
    return next
  }

  for (const spec of visible) {
    const v = next[spec.id] ?? 0
    next[spec.id] = v / sum
  }
  return next
}
