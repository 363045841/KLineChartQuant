/**
 * 工作区标识色：把主进程分配的槽位映射到调色板 token。
 *
 * 槽位由窗口集合分配（同屏窗口不撞色），这里只负责取色；
 * 颜色本身仍由 core 的 token 输出，不在此写死。
 */

/** 指标色板槽位数，对应 ColorTokens.palette 的 i1..i10。 */
const PALETTE_SIZE = 10

/**
 * 把色槽位映射到可直接用于 CSS 变量的颜色引用。
 *
 * @param slot 主进程分配的非负槽位；超过调色板容量时回绕
 * @returns 调色板 token 引用
 */
export function workspaceAccent(slot: number): string {
  return `var(--klc-color-palette-i${(slot % PALETTE_SIZE) + 1})`
}
