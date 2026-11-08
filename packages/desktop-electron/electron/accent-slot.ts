/**
 * 工作区标识色槽位分配。
 *
 * 颜色由主进程在开窗时分配：只有它知道同一时刻有哪些窗口，
 * 因此也只有它能保证同屏窗口不撞色。
 */

/**
 * 取当前未被占用的最小槽位。
 *
 * 窗口关闭后槽位立即释放，后续新窗口可以复用，因此同屏窗口始终互不相同；
 * 存活窗口数超过调色板容量后才会回绕。
 *
 * @param used 存活窗口已占用的槽位
 * @returns 可用的最小非负槽位
 */
export function nextAccentSlot(used: Iterable<number>): number {
  const taken = new Set(used)
  let slot = 0
  while (taken.has(slot)) slot += 1
  return slot
}
