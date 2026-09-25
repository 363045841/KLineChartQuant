/**
 * ansi.mjs
 *
 * 终端 ANSI 样式常量与着色工具：统一 TTY / NO_COLOR 判定，供各脚本复用。
 */

// 复位所有 ANSI 样式
const RESET = '\u001b[0m'

// 文本颜色与字重码，按语义命名
export const ANSI = {
  bold: '\u001b[1m',
  dim: '\u001b[2m',
  red: '\u001b[31m',
  green: '\u001b[32m',
  // 256 色浅绿，用于主题强调色（需终端支持 256 色）
  softGreen: '\u001b[38;5;114m',
  yellow: '\u001b[33m',
  blue: '\u001b[34m',
  magenta: '\u001b[35m',
  cyan: '\u001b[36m',
}

/** 输出流是否启用颜色：是 TTY 且未设置 NO_COLOR。 */
export function supportsColor(output = process.stdout) {
  return output.isTTY === true && process.env.NO_COLOR === undefined
}

/**
 * 用 ANSI 码包裹文本；不满足着色条件时原样返回。
 * @param {string} text 原始文本
 * @param {string | string[]} codes 单个 ANSI 码或码数组
 * @param {NodeJS.WriteStream} output 目标输出流，默认 stdout
 * @returns {string} 启用颜色时为着色文本，否则为原文
 */
export function paint(text, codes, output = process.stdout) {
  if (!supportsColor(output)) return text
  const prefix = Array.isArray(codes) ? codes.join('') : codes
  return `${prefix}${text}${RESET}`
}
