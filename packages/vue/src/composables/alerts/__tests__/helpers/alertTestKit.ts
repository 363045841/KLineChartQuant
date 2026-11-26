/** 警报 UI 测试夹具：脚本注册、假行情会话与规则构造。 */
import { expect } from 'vitest'
import {
  type AlertFiresDocument,
  type AlertRulesDocument,
  type AlertService,
  createAlertService,
  createCalculationHub,
  registerIndicators,
  type SymbolSpec,
} from '@363045841yyt/klinechart-core'
import { createMemoryDocumentStore } from '@363045841yyt/klinechart-core/persistence'
import type { InstrumentDescriptor } from '@363045841yyt/klinechart-core/market-data'
import { nextTick } from 'vue'

export const SCRIPT_ID = 'PriceCross'

export function instrument(id: string, symbol: string): InstrumentDescriptor {
  return {
    id,
    source: 'test',
    symbol,
    name: symbol,
    instrumentType: 'stock',
    exchange: 'SZ',
    capabilities: {
      bars: { periods: ['1min', 'daily'], adjustments: ['none'] },
      timeShare: true,
    },
  }
}

export const BTC = instrument('btc', 'BTCUSDT')
export const ETH = instrument('eth', 'ETHUSDT')
export const CURRENT: SymbolSpec = { instrument: BTC, period: '1min', adjust: 'none' }

/** 注册一个警报脚本描述符；目录、规则校验与工作区共用同一份注册表。 */
export function registerScript(): void {
  expect(
    registerIndicators([
      {
        kind: 'descriptor',
        candidate: { key: SCRIPT_ID, origin: 'third-party', identity: 'native' },
        descriptor: {
          kind: 'alert',
          source: 'script',
          frequency: 'per-bar',
          name: SCRIPT_ID,
          displayName: '价格穿越',
          category: 'sub',
          defaultPaneId: 'sub_alert',
          defaultInputs: { price: 100 },
        },
      },
    ]).failures,
  ).toEqual([])
}

/** 新建真实的警报服务；计算中枢不参与这些 UI 用例。 */
export async function createAlertBackend() {
  const hub = createCalculationHub({ resolveDefinition: () => undefined })
  const service: AlertService = await createAlertService({
    hub,
    rules: createMemoryDocumentStore<AlertRulesDocument>(null),
    fires: createMemoryDocumentStore<AlertFiresDocument>(null),
    feeds: { retain: () => {} },
  })
  return {
    hub,
    service,
    async dispose() {
      await service.dispose()
      hub.dispose()
    },
  }
}

/** 规则草稿；默认使用当前图表品种。 */
export function draft(symbol: SymbolSpec, name = '价格穿越') {
  return {
    name,
    script: { definitionId: SCRIPT_ID, inputs: {} },
    symbol,
    message: '{{message}}',
    channels: ['in-app'] as const,
  }
}

/** 等待 Vue 订阅与计算属性吸收 Core 信号通知。 */
export async function settle(): Promise<void> {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 0))
}
