/**
 * 工作区身份的视觉标识：同一身份永远映射到同一个色板槽位。
 *
 * 与自选行图标同一套色板约定（`--klc-color-palette-i1..i10`），颜色本身仍由 token 输出。
 */

/** 指标色板槽位数，对应 ColorTokens.palette 的 i1..i10。 */
const PALETTE_SIZE = 10

/**
 * 把工作区身份散列到色板槽位。
 *
 * @param workspaceId 工作区身份
 * @returns 可直接用于 CSS 变量的颜色引用
 */
export function workspaceAccent(workspaceId: string): string {
  let hash = 0
  for (const char of workspaceId) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % PALETTE_SIZE
  }
  return `var(--klc-color-palette-i${hash + 1})`
}
