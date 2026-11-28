/** 警报 UI 测试夹具：脚本注册、假行情会话与规则构造。 */
import { expect } from 'vitest'
import {
  type AlertDocument,
  type AlertScriptDefinition,
  type AlertService,
  createAlertCatalog,
  createAlertService,
  createCalculationHub,
  createDefinitionRegistry,
  DEFAULT_ALERT_LIMITS,
  type DefinitionRegistry,
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

/** 一个用例独占的警报夹具：注册表、脚本注册与真实服务。 */
export interface AlertTestContext {
  readonly definitions: DefinitionRegistry
  registerScript(): void
  scriptDefinition(id?: string): AlertScriptDefinition
  createBackend(): Promise<{
    service: AlertService
    dispose(): Promise<void>
  }>
}

/** 创建用例级上下文；每次调用都得到独立的定义注册表与服务。 */
export function createAlertTestContext(): AlertTestContext {
  const definitions = createDefinitionRegistry()

  /** 注册一个警报脚本描述符；目录、规则校验与工作区共用本上下文的注册表。 */
  function registerScript(): void {
    expect(
      definitions.register([
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
            info: '收盘价上穿设定价格时触发。',
          },
        },
      ]).failures,
    ).toEqual([])
  }

  /** 目录中的警报脚本定义；必须在 registerScript 之后读取。 */
  function scriptDefinition(id: string = SCRIPT_ID): AlertScriptDefinition {
    const script = createAlertCatalog(definitions)().find((item) => item.id === id)
    if (!script) throw new Error(`Missing alert script fixture: ${id}`)
    return script
  }

  /** 新建真实的警报服务；计算中枢不参与这些 UI 用例。 */
  async function createBackend() {
    const hub = createCalculationHub({ resolveDefinition: () => undefined })
    const service: AlertService = await createAlertService({
      hub,
      definitions,
      document: createMemoryDocumentStore<AlertDocument>(null),
      acquireBars: () => () => {},
      clock: { now: () => 0 },
      limits: DEFAULT_ALERT_LIMITS,
      onError: () => {},
    })
    return {
      service,
      async dispose() {
        await service.dispose()
        hub.dispose()
      },
    }
  }

  return { definitions, registerScript, scriptDefinition, createBackend }
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
