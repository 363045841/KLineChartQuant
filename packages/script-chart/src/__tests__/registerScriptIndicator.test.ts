/**
 * 适配层测试：脚本定义被翻译成图表指标定义，脚本引擎与图表引擎都保持独立。
 */
import { getIndicatorDescriptor } from '@363045841yyt/klinechart-core'
import { defineIndicator, input } from '@363045841yyt/klinechart-script'
import { describe, expect, it } from 'vitest'
import { registerScriptIndicator } from '../impl/registerScriptIndicator.js'

/** 注册到主图的脚本：输出收盘价折线，并带一个数字参数。 */
const mainLine = defineIndicator({
  name: 'AdapterMainLine',
  inputs: { factor: input(2, '系数') },
  onBar(ctx) {
    ctx.plot(ctx.close, { id: 'close' })
  },
})

/** 缺省位置的脚本：验证副图与显示名回落。 */
const subLine = defineIndicator({
  name: 'AdapterSubLine',
  inputs: {},
  onBar(ctx) {
    ctx.plot(ctx.close, { id: 'close' })
  },
})

describe('registerScriptIndicator', () => {
  it('翻译为主图指标定义，并保留脚本参数默认值与展示标题', () => {
    registerScriptIndicator(mainLine, { pane: 'main', displayName: '适配折线' })

    expect(getIndicatorDescriptor('AdapterMainLine')).toMatchObject({
      name: 'AdapterMainLine',
      displayName: '适配折线',
      source: 'script',
      category: 'main',
      defaultPaneId: 'main',
      defaultParams: { factor: 2 },
      inputDefs: { factor: { title: '系数' } },
    })
  })

  it('缺省注册到副图，显示名回落为脚本名称', () => {
    registerScriptIndicator(subLine)

    expect(getIndicatorDescriptor('AdapterSubLine')).toMatchObject({
      displayName: 'AdapterSubLine',
      source: 'script',
      category: 'sub',
      defaultPaneId: 'sub_AdapterSubLine',
    })
  })
})
