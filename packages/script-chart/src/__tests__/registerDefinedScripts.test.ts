/**
 * 自动注册测试：开启一次后，已定义和之后定义的脚本都进入指标目录。
 */
import { getIndicatorDescriptor } from '@363045841yyt/klinechart-core'
import { defineIndicator } from '@363045841yyt/klinechart-script'
import { describe, expect, it } from 'vitest'
import { registerDefinedScripts } from '../impl/registerDefinedScripts.js'

/** 开启自动注册之前就已声明的脚本。 */
const earlyScript = defineIndicator({
  name: 'AutoEarlyScript',
  pane: 'main',
  inputs: {},
  onBar(ctx) {
    ctx.plot(ctx.close, { id: 'close' })
  },
})

describe('registerDefinedScripts', () => {
  it('回放已定义脚本，并接收之后声明的脚本', () => {
    registerDefinedScripts()

    expect(getIndicatorDescriptor('AutoEarlyScript')).toMatchObject({
      source: 'script',
      category: 'main',
    })

    defineIndicator({
      name: 'AutoLateScript',
      inputs: {},
      onBar(ctx) {
        ctx.plot(ctx.close, { id: 'close' })
      },
    })
    expect(getIndicatorDescriptor('AutoLateScript')).toMatchObject({
      source: 'script',
      category: 'sub',
      defaultPaneId: 'sub_AutoLateScript',
    })
  })

  it('重复开启不重复注册', () => {
    expect(() => registerDefinedScripts()).not.toThrow()
  })
})
