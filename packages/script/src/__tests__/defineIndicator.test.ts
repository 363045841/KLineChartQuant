/** 校验 defineIndicator 登记与订阅行为：回放、实时通知、重复声明去重。 */
import { describe, expect, it, vi } from 'vitest'
import { defineIndicator, getDefinedScripts, subscribeScriptDefinitions } from '../index.js'

describe('defineIndicator registry', () => {
  it('订阅时回放已有定义，并接收之后声明的脚本', () => {
    const first = defineIndicator({ name: 'RegistryFirst', inputs: {}, onBar() {} })
    const listener = vi.fn()
    const unsubscribe = subscribeScriptDefinitions(listener)
    expect(listener).toHaveBeenCalledWith(first)

    const second = defineIndicator({ name: 'RegistrySecond', inputs: {}, onBar() {} })
    expect(listener).toHaveBeenLastCalledWith(second)
    expect(getDefinedScripts()).toEqual([first, second])

    unsubscribe()
    defineIndicator({ name: 'RegistryThird', inputs: {}, onBar() {} })
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('同一对象重复声明只登记一次', () => {
    const script = defineIndicator({ name: 'RegistryOnce', inputs: {}, onBar() {} })
    defineIndicator(script)

    expect(getDefinedScripts().filter((item) => item === script)).toHaveLength(1)
  })
})
