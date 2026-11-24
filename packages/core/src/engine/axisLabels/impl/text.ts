/**
 * 标签文本宽度估算：不依赖 DOM 与 Canvas，轴宽估算与绘制共用同一答案。
 *
 * 全角字符按一字宽预留，数字与拉丁字符按字形比例估算；估宽只需保证稳定与
 * 单调，不追求与浏览器逐像素一致。
 */

/** 数字宽度（相对字号）。 */
const DIGIT_WIDTH = 0.64

/** 标点与空白宽度。 */
const NARROW_WIDTH = 0.36

/** 拉丁字符宽度。 */
const LATIN_WIDTH = 0.75

/** 全角字符宽度。 */
const WIDE_WIDTH = 1

/**
 * 估算文本宽度。
 *
 * @param text 标签文本
 * @param fontSize 字号，逻辑像素
 * @returns 逻辑像素宽度
 */
export function measureAxisText(text: string, fontSize: number): number {
  let units = 0
  for (const char of text) {
    if (/[0-9]/u.test(char)) units += DIGIT_WIDTH
    else if (/[.,:;'\s]/u.test(char)) units += NARROW_WIDTH
    else if ((char.codePointAt(0) ?? 0) > 0xff) units += WIDE_WIDTH
    else units += LATIN_WIDTH
  }
  return units * fontSize
}
