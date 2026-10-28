/** 验证脚本声明契约：内置目录、全局枚举、展示字段、输入参数与非法声明。 */
import { Color } from '@363045841yyt/klinechart-plot-contracts'
import { describe, expect, it } from 'vitest'
import {
  barsFromCloses,
  builtinScriptNames,
  requireValues,
  shippedSource,
} from '../../__tests__/marketData.js'
import { ScriptExecutionError } from '../../errors.js'
import { builtinScriptSources } from '../generated/builtinScripts.js'
import { readQuickJSScriptDefinitionSync, runQuickJSScript } from '../impl/runQuickJSScript.js'

describe('脚本声明契约', () => {
  it('生成的内置目录覆盖 scripts 下全部 TS 文件，不维护第二份名单', () => {
    expect(builtinScriptSources).toEqual(builtinScriptNames().map(shippedSource))
  })

  it.each([
    ['Main', 'main'],
    ['Sub', 'sub'],
  ])('从 QuickJS Global 读取 Position.%s 作为指标注册位置', (member, expected) => {
    const source = `defineIndicator({ name: 'PositionEnum', position: globalThis.Position.${member}, inputs: {}, onBar() {
      if (Position !== globalThis.Position) throw new Error('枚举全局不一致')
    } })`
    expect(readQuickJSScriptDefinitionSync(source)).toMatchObject({ position: expected })
  })

  it('读取可选 title/info 作为选择器展示名与说明，缺省不写入，空值拒绝', () => {
    const titled = readQuickJSScriptDefinitionSync(
      `defineIndicator({ name: 'Titled', title: '展示名', info: '说明文本', position: Position.Sub, inputs: {}, onBar() {} })`,
    )
    expect(titled).toMatchObject({ name: 'Titled', title: '展示名', info: '说明文本' })

    const plain = readQuickJSScriptDefinitionSync(
      `defineIndicator({ name: 'Plain', position: Position.Sub, inputs: {}, onBar() {} })`,
    )
    expect(plain).not.toHaveProperty('title')
    expect(plain).not.toHaveProperty('info')

    for (const field of [`title: ' '`, `info: ' '`]) {
      expect(() =>
        readQuickJSScriptDefinitionSync(
          `defineIndicator({ name: 'Empty', ${field}, position: Position.Sub, inputs: {}, onBar() {} })`,
        ),
      ).toThrow()
    }
  })

  it('Color 常用色枚举在 VM 中与共享契约逐项一致，取值可直接作为绘图颜色', async () => {
    // 成员表由契约生成，用例只比对色值，不复制一份调色板。
    const checks = Object.entries(Color)
      .map(
        ([member, value]) =>
          `if (Color.${member} !== ${JSON.stringify(value)}) throw new Error('Color.${member} 与契约不一致')`,
      )
      .join('\n')
    const result = await runQuickJSScript({
      source: `defineIndicator({ name: 'ColorEnum', position: Position.Sub, inputs: {}, onBar() {
        ${checks}
        plot.Line(close[0], 'line', { color: Color.Teal })
      } })`,
      bars: barsFromCloses([2, 4]),
    })
    expect(requireValues(result, 'line')).toEqual([2, 4])
    expect(result.plots[0]?.data.map((point) => point?.color)).toEqual([Color.Teal, Color.Teal])
  })

  it('字符串输入的 options 随声明保存，供参数面板渲染下拉', () => {
    const definition = readQuickJSScriptDefinitionSync(
      `defineIndicator({ name: 'OptionScript', position: Position.Sub, onBar() {
        const type = input.string('SMA', { title: '算法', options: ['SMA', 'EMA'] })
      } })`,
    )
    expect(definition.inputs).toEqual({
      type: { default: 'SMA', title: '算法', options: ['SMA', 'EMA'] },
    })
  })

  it('周期输入接受 Timeframe 成员并保存声明', () => {
    const definition = readQuickJSScriptDefinitionSync(
      `defineIndicator({ name: 'TimeframeScript', position: Position.Sub, onBar() {
        const timeframe = input.timeframe(Timeframe.Day, {
          title: '目标周期',
          options: [Timeframe.Hour1, Timeframe.Day],
        })
        plot.Line(ta.sma(close, 2)[0], timeframe)
      } })`,
    )
    expect(definition.inputs).toEqual({
      timeframe: { default: 'D', title: '目标周期', options: ['60', 'D'] },
    })
  })

  it.each([
    `plot.Line(1, 'x')`,
    `defineIndicator({ name: 'MissingPosition', inputs: {}, onBar() {} })`,
    `defineIndicator({ name: 'Bad', position: 'side', inputs: {}, onBar() {} })`,
    `defineIndicator({ name: 'Bad', inputs: { period: input.float(Infinity) }, onBar() {} })`,
    `defineIndicator({ name: 'Bad', inputs: { period: input.int(2.5) }, onBar() {} })`,
    `defineIndicator({ name: 'Bad', inputs: { period: input.string('a', { options: [] }) }, onBar() {} })`,
    `defineIndicator({ name: 'Bad', inputs: { period: input.string('a', { options: [1] }) }, onBar() {} })`,
    `defineIndicator({ name: 'Bad', inputs: { timeframe: input.timeframe('2h') }, onBar() {} })`,
    `defineIndicator({ name: 'Bad', inputs: { timeframe: input.timeframe('D', { options: ['60'] }) }, onBar() {} })`,
    `defineIndicator({ name: 'Bad', inputs: {}, onBar() {} }); defineIndicator({})`,
  ])('拒绝不完整或错误声明：%s', async (source) => {
    await expect(runQuickJSScript({ source, bars: [] })).rejects.toBeInstanceOf(
      ScriptExecutionError,
    )
  })
})

describe('input 编译规则', () => {
  it.each([
    {
      name: '调用不在 const 初始化里',
      source: `defineIndicator({ name: 'Bad', position: Position.Main, onBar() {
        plot.Line(input.int(2), 'level')
      } })`,
      message: '必须直接初始化 onBar 顶层的 const 变量',
    },
    {
      name: '嵌套函数内的声明',
      source: `defineIndicator({ name: 'Bad', position: Position.Main, onBar() {
        const helper = () => { const level = input.int(2) }
        plot.Line(close[0], 'close')
      } })`,
      message: '只能声明在 onBar 中',
    },
    {
      name: '未知输入类型',
      source: `defineIndicator({ name: 'Bad', position: Position.Main, onBar() {
        const level = input.gigantic(2)
      } })`,
      message: '未知的输入类型',
    },
    {
      name: '重复的参数名',
      source: `defineIndicator({ name: 'Bad', position: Position.Main, onBar() {
        const level = input.int(2)
        const level = input.int(3)
      } })`,
      message: '输入参数名称重复',
    },
  ])('$name 被拒绝', ({ source, message }) => {
    expect(() => readQuickJSScriptDefinitionSync(source)).toThrow(message)
  })
})
