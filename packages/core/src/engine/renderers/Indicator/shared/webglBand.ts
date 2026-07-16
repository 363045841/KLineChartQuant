export function getRgbaAlpha(color: string): number {
  const match = color.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/i)
  if (!match) return 1
  const alpha = Number(match[1])
  return Number.isFinite(alpha) ? alpha : 1
}

export function toOpaqueRgba(color: string): string {
  return color.replace(/,\s*[\d.]+\s*\)$/i, ', 1)')
}
