/**
 * 聚合数据源测试共享夹具：源元数据工厂、在线/离线拨测替身与注册表注册。
 * 仅供 __tests__ 消费；vitest 只收集 *.test.ts，本文件不会被当作测试。
 */
import type { SourceProbeResult } from '@363045841yyt/klinechart-core/controllers'
import { marketDataProviderRegistry } from '@363045841yyt/klinechart-core/controllers'
import { vi } from 'vitest'

import type { AggregationSourceDefinition } from '../useAggregationSources'

/** 构造拨测 / 启用逻辑用的最小源元数据；capabilities 仅用于展示。 */
export function source(
  name: string,
  options: { searchable?: boolean; defaultBaseUrl?: string } = {},
): AggregationSourceDefinition {
  const searchable = options.searchable ?? true
  return {
    name,
    displayName: name.toUpperCase(),
    capabilities: searchable ? ['search'] : ['daily'],
    defaultBaseUrl: options.defaultBaseUrl,
  }
}

/** 在线拨测替身；latencyMs 省略时不带延迟字段。 */
export function createOnlineProbe(latencyMs?: number) {
  return vi.fn(
    async (): Promise<SourceProbeResult> => ({
      status: 'online',
      checkedAt: 1,
      ...(latencyMs === undefined ? {} : { latencyMs }),
    }),
  )
}

/** 离线拨测替身。 */
export function createOfflineProbe() {
  return vi.fn(async (): Promise<SourceProbeResult> => ({ status: 'offline', checkedAt: 1 }))
}

/** 注册一个测试 Provider；searchable=false 时不提供 catalog。 */
export function registerProvider(
  name: string,
  probe: () => Promise<SourceProbeResult>,
  options: { searchable?: boolean; defaultBaseUrl?: string } = {},
): void {
  const { searchable = true, defaultBaseUrl } = options
  marketDataProviderRegistry.register({
    source: { id: name, displayName: name, ...(defaultBaseUrl ? { defaultBaseUrl } : {}) },
    probe,
    ...(searchable ? { catalog: { search: async () => [] } } : {}),
  })
}
