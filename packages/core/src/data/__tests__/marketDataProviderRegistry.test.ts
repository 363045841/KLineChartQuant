/** 统一行情 Provider 注册表与运行时配置测试。 */

import { beforeEach, describe, expect, it } from 'vitest'

import { KLineChartError } from '../../errors'
import { MarketDataProviderRegistry, type MarketDataProvider } from '../marketData'

const gotdxProvider = {
  source: { id: 'gotdx', displayName: 'GOTDX' },
  /** 返回固定在线状态，避免测试依赖网络。 */
  async probe() {
    return { status: 'online' as const, checkedAt: 1 }
  },
} satisfies MarketDataProvider

const mockProvider = {
  source: { id: 'mock', displayName: 'Mock' },
  /** 返回固定在线状态，避免测试依赖网络。 */
  async probe() {
    return { status: 'online' as const, checkedAt: 1 }
  },
} satisfies MarketDataProvider

describe('MarketDataProviderRegistry', () => {
  let registry: MarketDataProviderRegistry

  beforeEach(() => {
    registry = new MarketDataProviderRegistry()
  })

  // 验证 Provider 默认启用，并保持注册顺序。
  it('注册 Provider 并生成默认配置', () => {
    registry.register(gotdxProvider)
    registry.register(mockProvider)

    expect(registry.get('gotdx')).toBe(gotdxProvider)
    expect(registry.getAll()).toEqual([gotdxProvider, mockProvider])
    expect(registry.getEnabled()).toEqual([gotdxProvider, mockProvider])
    expect(registry.getConfig('gotdx')).toEqual({ enabled: true })
  })

  // 验证重复 source ID 不会覆盖已有 Provider。
  it('拒绝重复注册 source ID', () => {
    registry.register(gotdxProvider)

    expect(() => registry.register(gotdxProvider)).toThrowError(KLineChartError)
    expect(registry.getAll()).toEqual([gotdxProvider])
  })

  // 验证空白或带首尾空格的 source ID 会被拒绝。
  it('拒绝非法 source ID', () => {
    const invalid = {
      ...gotdxProvider,
      source: { ...gotdxProvider.source, id: ' gotdx ' },
    } satisfies MarketDataProvider

    expect(() => registry.register(invalid)).toThrow(/source\.id must be non-empty and trimmed/)
  })

  // 验证启用状态和 Base URL 可独立更新及清除。
  it('管理数据源运行时配置', () => {
    registry.register(gotdxProvider, {
      enabled: false,
      baseUrl: ' http://127.0.0.1:8080/ ',
    })

    expect(registry.getEnabled()).toEqual([])
    expect(registry.getConfig('gotdx')).toEqual({
      enabled: false,
      baseUrl: 'http://127.0.0.1:8080',
    })
    expect(registry.setConfig('gotdx', { enabled: true, baseUrl: '' })).toEqual({
      enabled: true,
    })
  })

  // 验证读取到的配置是副本，外部修改不会污染注册表。
  it('返回隔离的配置快照', () => {
    registry.register(gotdxProvider)
    const snapshot = registry.getConfig('gotdx')

    snapshot.enabled = false

    expect(registry.getConfig('gotdx')).toEqual({ enabled: true })
  })

  // 验证未注册数据源无法读取或写入配置。
  it('拒绝操作未注册的数据源', () => {
    expect(() => registry.getRequired('missing')).toThrowError(KLineChartError)
    expect(() => registry.getConfig('missing')).toThrow(/is not registered/)
    expect(() => registry.setConfig('missing', { enabled: false })).toThrow(/is not registered/)
  })

  // 验证注销和清空会同步移除 Provider 与配置。
  it('注销并清空 Provider', () => {
    registry.register(gotdxProvider)
    registry.register(mockProvider)

    expect(registry.unregister('gotdx')).toBe(true)
    expect(registry.unregister('gotdx')).toBe(false)
    expect(registry.get('gotdx')).toBeUndefined()
    expect(() => registry.getConfig('gotdx')).toThrow(/is not registered/)

    registry.clear()
    expect(registry.getAll()).toEqual([])
  })
})
