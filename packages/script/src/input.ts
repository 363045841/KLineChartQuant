/**
 * input：输入参数声明工厂。
 *
 * 对齐 Pine Script 的 input(default, title)：位置参数是默认值与标题，
 * 参数名仍由 inputs 表的键给出，所以脚本里照旧读 params.n。
 */

import type { InputDef } from './contracts/script.js'

/** 参数面板可编辑的原始值类型；其余类型没有对应的编辑项。 */
type InputValue = number | string | boolean

/**
 * 声明一个输入参数。
 *
 * @param defaultValue 默认值，同时决定面板里的编辑类型（数字 / 文本 / 开关）
 * @param title 面板显示名，缺省显示参数名
 */
export function input<T extends InputValue>(defaultValue: T, title: string): InputDef<T> {
  return { default: defaultValue, title }
}
