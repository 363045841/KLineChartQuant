/**
 * 测试用品种工厂：用例只声明差异，统一品种与图表选择的装配在唯一一处完成。
 *
 * 仅用于 __tests__；vitest 只收集 *.test.ts，本文件不会被当作测试。
 */
import type { SymbolSpec } from '@/foundation/types/instrument.js'
import type {
  InstrumentCapabilities,
  InstrumentDescriptor,
  InstrumentType,
} from '@/data/provider/types'

/** 构造统一品种描述的入参；只声明与默认值不同的字段。 */
export interface InstrumentInput {
  symbol: string
  id?: string
  source?: string
  name?: string
  instrumentType?: InstrumentType
  exchange?: string
  /** 会话标识的历史叫法；与 sessionId 等价。 */
  market?: string
  sessionId?: string
  providerRef?: Readonly<Record<string, string | number | boolean>>
  capabilities?: InstrumentCapabilities
  tickSize?: number
  lotSize?: number
  currency?: string
}

/**
 * 构造统一品种描述。
 *
 * @param input 品种代码与可选差异
 * @returns 可被 Provider 请求与图表身份共同消费的描述
 */
export function makeInstrument(input: InstrumentInput): InstrumentDescriptor {
  const source = input.source ?? 'test'
  const sessionId = input.sessionId ?? input.market
  return {
    id: input.id ?? `${source}:${sessionId ?? input.exchange ?? ''}:${input.symbol}`,
    source,
    symbol: input.symbol,
    name: input.name ?? input.symbol,
    instrumentType: input.instrumentType ?? 'stock',
    exchange: input.exchange ?? '',
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(input.providerRef === undefined ? {} : { providerRef: input.providerRef }),
    ...(input.tickSize === undefined ? {} : { tickSize: input.tickSize }),
    ...(input.lotSize === undefined ? {} : { lotSize: input.lotSize }),
    ...(input.currency === undefined ? {} : { currency: input.currency }),
    capabilities: input.capabilities ?? {},
  }
}

/** 构造业务品种的入参；提供 `instrument` 时其余品种字段不再参与装配。 */
export interface SymbolSpecInput extends Partial<InstrumentInput> {
  symbol?: string
  instrument?: InstrumentDescriptor
  period?: string
  adjust?: string
  startDate?: string
  endDate?: string
  incremental?: boolean
}

/**
 * 构造业务品种。
 *
 * @param input 品种与图表选择
 * @returns 只含 instrument 与图表级字段的 SymbolSpec
 */
export function makeSymbolSpec(input: SymbolSpecInput): SymbolSpec {
  const instrument = input.instrument ?? makeInstrument(input as InstrumentInput)
  return {
    instrument,
    ...(input.period === undefined ? {} : { period: input.period }),
    ...(input.adjust === undefined ? {} : { adjust: input.adjust }),
    ...(input.startDate === undefined ? {} : { startDate: input.startDate }),
    ...(input.endDate === undefined ? {} : { endDate: input.endDate }),
    ...(input.incremental === undefined ? {} : { incremental: input.incremental }),
  }
}
