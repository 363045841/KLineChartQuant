/** DOM 动效的统一入口：token 读取与 reduced-motion 判断只在这里实现，组件不各写一份。 */

/**
 * 系统是否要求减少动效。
 * CSS 侧由 `styles/motion.css` 统一归零；JS 驱动的动画（如弹窗尺寸过渡）用它提前短路。
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * 读取元素继承到的 motion token 原始值。
 *
 * @param element 持有主题变量的元素
 * @param token token 名（不含 `--klc-motion-` 前缀），如 `dur-base` / `ease-out`
 * @returns 计算后的 token 值；未定义时抛错，避免用猜出来的时长继续动画
 */
export function readMotionToken(element: Element, token: string): string {
  const value = getComputedStyle(element).getPropertyValue(`--klc-motion-${token}`).trim()
  if (!value) throw new Error(`[motion] --klc-motion-${token} is not defined`)
  return value
}

/**
 * 读取 motion 时长 token 的毫秒值，供 Web Animations API 使用。
 *
 * @param element 持有主题变量的元素
 * @param token 时长 token 名，如 `dur-base`
 * @returns 毫秒数
 */
export function readMotionDuration(element: Element, token: string): number {
  return Number.parseFloat(readMotionToken(element, token))
}
