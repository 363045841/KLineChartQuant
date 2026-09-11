// 本文件实现对比品种的统一写原语：唯一入口处理选择、视图切换与重绘。
import { type Static, Type } from 'typebox'

import type { SymbolSpec } from '../../controllers/types'
import { Tool } from '../../foundation/agent/chartToolRegistry'

import { symbolSpecIdentityKey } from './symbolIdentity'

const ComparisonCreateToolParameters = Type.Object(
  {
    symbol: Type.String({ minLength: 1 }),
    market: Type.Optional(Type.String({ minLength: 1 })),
    exchange: Type.Optional(Type.String({ minLength: 1 })),
    source: Type.Optional(Type.String({ minLength: 1 })),
    period: Type.Optional(Type.String({ minLength: 1 })),
    adjust: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
)

const ComparisonRemoveToolParameters = Type.Object(
  { identity: Type.String({ minLength: 1 }) },
  { additionalProperties: false },
)

const ComparisonsListToolParameters = Type.Object({})
const ComparisonsClearToolParameters = Type.Object({})

export type ComparisonCreateInput = Static<typeof ComparisonCreateToolParameters>
export type ComparisonRemoveInput = Static<typeof ComparisonRemoveToolParameters>

/** Agent 可读取的对比品种快照；identity 用于精确删除。 */
export interface ComparisonSnapshot {
  readonly identity: string
  readonly spec: SymbolSpec
  readonly color: string | null
}

/** 对比命令运行所需的领域能力，不依赖 DOM 或 renderer。 */
export interface ComparisonCommandsDependencies {
  /** 当前完整 symbols 快照（primary + comparison）。 */
  getSymbols(): ReadonlyArray<SymbolSpec>
  /** 原子写回 symbols 选择；实现负责同步对比颜色。 */
  commitSymbols(next: ReadonlyArray<SymbolSpec>): void
  /** 进入或退出比较视图（mode + 主图 percent 刻度副作用）。 */
  setComparisonViewActive(active: boolean): void
  /** 校验品种市场会话；未知 market 抛领域错误。 */
  validateSpec(spec: SymbolSpec): void
  /** 返回指定对比品种的展示颜色。 */
  getColor(identity: string): string | undefined
  /** 请求重绘。 */
  scheduleDraw(): void
}

/** 对比品种的统一写原语契约。 */
export interface ComparisonCommandsApi {
  list(): ReadonlyArray<ComparisonSnapshot>
  create(input: ComparisonCreateInput): boolean
  remove(input: ComparisonRemoveInput): boolean
  clear(): number
}

/**
 * 对比品种 CRUD 的唯一写入口：UI 与 Agent 调用同一实例。
 * 选择仍写入 symbols 尾部，comparisonState 派生 specs 与颜色，不产生第二份业务状态。
 */
export class ComparisonCommands implements ComparisonCommandsApi {
  constructor(private readonly dependencies: ComparisonCommandsDependencies) {}

  /** 返回当前全部对比品种及其颜色。 */
  @Tool({
    name: 'comparisons_list',
    label: 'List comparison symbols',
    description:
      'List every comparison symbol currently overlaid on the chart. Each item exposes the stable identity, the complete symbol spec, and the assigned line color. Use identity with comparison_remove.',
    parameters: ComparisonsListToolParameters,
    safety: 'read-only',
    executionMode: 'parallel',
  })
  list(): ReadonlyArray<ComparisonSnapshot> {
    return this.comparisonSpecs().map((spec) => {
      const identity = symbolSpecIdentityKey(spec)
      return Object.freeze({
        identity,
        spec: Object.freeze({ ...spec }),
        color: this.dependencies.getColor(identity) ?? null,
      })
    })
  }

  /** 新增一个对比品种；重复或缺少主品种时返回 false。 */
  @Tool({
    name: 'comparison_create',
    label: 'Add comparison symbol',
    description:
      'Add one comparison symbol to the main chart. symbol is required; market, exchange, source, period, and adjust default to the primary symbol when omitted. Returns false when the symbol is already compared or the chart has no primary symbol. An unknown market is rejected.',
    parameters: ComparisonCreateToolParameters,
    safety: 'destructive',
    executionMode: 'sequential',
  })
  create(input: ComparisonCreateInput): boolean {
    const primary = this.primarySpec()
    if (!primary) return false
    const spec = this.resolveCreateInput(input, primary)
    const identity = symbolSpecIdentityKey(spec)
    const specs = this.comparisonSpecs()
    if (specs.some((item) => symbolSpecIdentityKey(item) === identity)) return false
    this.dependencies.validateSpec(spec)
    this.dependencies.commitSymbols([primary, ...specs, spec])
    if (specs.length === 0) this.dependencies.setComparisonViewActive(true)
    this.dependencies.scheduleDraw()
    return true
  }

  /** 按 identity（或品种代码）删除一个对比品种。 */
  @Tool({
    name: 'comparison_remove',
    label: 'Remove comparison symbol',
    description:
      'Remove one comparison symbol by its identity from comparisons_list; a matching symbol code also works. The chart returns to the K-line view when the last comparison is removed.',
    parameters: ComparisonRemoveToolParameters,
    safety: 'destructive',
    executionMode: 'sequential',
  })
  remove(input: ComparisonRemoveInput): boolean {
    const primary = this.primarySpec()
    if (!primary) return false
    const specs = this.comparisonSpecs()
    const matches = (spec: SymbolSpec) =>
      symbolSpecIdentityKey(spec) === input.identity || spec.symbol === input.identity
    if (!specs.some(matches)) return false
    const remaining = specs.filter((spec) => !matches(spec))
    this.dependencies.commitSymbols([primary, ...remaining])
    if (remaining.length === 0) this.dependencies.setComparisonViewActive(false)
    this.dependencies.scheduleDraw()
    return true
  }

  /** 删除全部对比品种并恢复 K 线视图，返回删除数量。 */
  @Tool({
    name: 'comparisons_clear',
    label: 'Clear comparison symbols',
    description:
      'Remove every comparison symbol and return the chart to the K-line view. Returns the number of removed symbols.',
    parameters: ComparisonsClearToolParameters,
    safety: 'destructive',
    executionMode: 'sequential',
  })
  clear(): number {
    const primary = this.primarySpec()
    const specs = this.comparisonSpecs()
    if (!primary || specs.length === 0) return 0
    this.dependencies.commitSymbols([primary])
    this.dependencies.setComparisonViewActive(false)
    this.dependencies.scheduleDraw()
    return specs.length
  }

  /** 主品种始终是 symbols 的第一项。 */
  private primarySpec(): SymbolSpec | null {
    return this.dependencies.getSymbols()[0] ?? null
  }

  /** 对比品种是 symbols 中主品种之后的全部项。 */
  private comparisonSpecs(): SymbolSpec[] {
    return this.dependencies.getSymbols().slice(1)
  }

  /** 用主品种补齐缺省字段，Agent 只给 symbol 时也能复用当前市场属性。 */
  private resolveCreateInput(input: ComparisonCreateInput, primary: SymbolSpec): SymbolSpec {
    return {
      symbol: input.symbol,
      market: input.market ?? primary.market,
      exchange: input.exchange ?? primary.exchange,
      source: input.source ?? primary.source,
      period: input.period ?? primary.period,
      adjust: input.adjust ?? primary.adjust,
    }
  }
}
