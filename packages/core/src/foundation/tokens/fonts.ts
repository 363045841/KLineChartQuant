/**
 * 图表字体配置
 * 字体栈：Trebuchet MS (Windows系统字体) -> Roboto -> Ubuntu -> 通用无衬线字体
 * DOM 与 Canvas 共用字体栈，浏览器按本地可用字体选择
 */

/** 数字和文本的标准字体栈 */
export const FONT_FAMILY = '"Trebuchet MS", Roboto, Ubuntu, sans-serif'

/** 获取指定字号的字体字符串，用于 Canvas ctx.font */
export function getFont(size: number, options?: { bold?: boolean }): string {
  const weight = options?.bold ? 'bold ' : ''
  return `${weight}${size}px ${FONT_FAMILY}`
}

export function setCanvasFont(ctx: CanvasRenderingContext2D, font: string): void {
  if (ctx.font !== font) {
    ctx.font = font
  }
}
