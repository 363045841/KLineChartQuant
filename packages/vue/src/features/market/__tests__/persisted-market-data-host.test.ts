/** 行情宿主的持久化契约：key、校验与旧版迁移必须与已发布宿主保持一致。 */

import type { MarketDataConfiguration } from '@363045841yyt/klinechart-core/market-data'
import { describe, expect, it } from 'vitest'

import { createPersistedMarketDataHost } from '../impl/persisted-market-data-host.js'

const CONFIGURATION_KEY = 'klinechart.market-data'
const LEGACY_CONNECTIONS_KEY = 'klinechart.aggregation-sources'
// 内置目录里可编辑连接的 Provider，行为与其他内置源相同。
const EDITABLE_SOURCE_ID = 'gotdx'

/** 读取已落盘的配置文档，同时断言它确实是合法 JSON。 */
function readPersistedConfiguration(): MarketDataConfiguration {
  const raw = window.localStorage.getItem(CONFIGURATION_KEY)
  expect(raw, '配置文档必须已经落盘').not.toBeNull()
  return JSON.parse(raw ?? 'null') as MarketDataConfiguration
}

describe('createPersistedMarketDataHost', () => {
  it('首次启动注册内置源并写入默认配置', () => {
    const host = createPersistedMarketDataHost()
    try {
      const persisted = readPersistedConfiguration()
      expect(Object.keys(persisted.connections)).toContain(EDITABLE_SOURCE_ID)
      expect(persisted.policies[EDITABLE_SOURCE_ID]?.enabled).toBe(true)
      expect(host.context.registry.get(EDITABLE_SOURCE_ID)).toBeDefined()
    } finally {
      host.dispose()
    }
  })

  it('恢复已保存的连接地址', () => {
    const initial = createPersistedMarketDataHost()
    const configuration = initial.context.configuration.peek()
    initial.dispose()

    const target = 'http://127.0.0.1:9187'
    configuration.connections[EDITABLE_SOURCE_ID] = { baseUrl: target }
    window.localStorage.setItem(CONFIGURATION_KEY, JSON.stringify(configuration))

    const restored = createPersistedMarketDataHost()
    try {
      expect(restored.context.configuration.peek().connections[EDITABLE_SOURCE_ID]?.baseUrl).toBe(
        target,
      )
    } finally {
      restored.dispose()
    }
  })

  it('把旧版按 Provider 保存的开关与地址迁移过来', () => {
    const target = 'http://127.0.0.1:9199'
    window.localStorage.setItem(
      LEGACY_CONNECTIONS_KEY,
      JSON.stringify({
        known: [EDITABLE_SOURCE_ID],
        enabled: [EDITABLE_SOURCE_ID],
        baseUrls: { [EDITABLE_SOURCE_ID]: target },
      }),
    )

    const host = createPersistedMarketDataHost()
    try {
      const configuration = host.context.configuration.peek()
      expect(configuration.connections[EDITABLE_SOURCE_ID]?.baseUrl).toBe(target)
      expect(configuration.policies[EDITABLE_SOURCE_ID]?.searchEnabled).toBe(true)
      // 迁移结果本身也要落盘，旧 key 不再作为事实来源。
      expect(readPersistedConfiguration().connections[EDITABLE_SOURCE_ID]?.baseUrl).toBe(target)
    } finally {
      host.dispose()
    }
  })

  it('损坏的配置文档不阻止启动，并被合法默认值覆盖', () => {
    window.localStorage.setItem(CONFIGURATION_KEY, '{not json')

    const host = createPersistedMarketDataHost()
    try {
      expect(host.context.registry.get(EDITABLE_SOURCE_ID)).toBeDefined()
      expect(Object.keys(readPersistedConfiguration().connections)).toContain(EDITABLE_SOURCE_ID)
    } finally {
      host.dispose()
    }
  })

  it('配置变更立即写回', () => {
    const host = createPersistedMarketDataHost()
    try {
      const target = 'http://127.0.0.1:9201'
      host.context.applyConnection(EDITABLE_SOURCE_ID, target)
      expect(readPersistedConfiguration().connections[EDITABLE_SOURCE_ID]?.baseUrl).toBe(target)
    } finally {
      host.dispose()
    }
  })

  it('释放后不再写入配置', () => {
    const host = createPersistedMarketDataHost()
    const before = readPersistedConfiguration()
    host.dispose()

    // 宿主释放后配置监听已解除，后续改动不再落盘。
    host.context.applyConnection(EDITABLE_SOURCE_ID, 'http://127.0.0.1:9202')
    expect(readPersistedConfiguration()).toEqual(before)
  })
})
