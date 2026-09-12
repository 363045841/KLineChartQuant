// 本文件实现对比品种的统一写原语：唯一入口处理选择、歧义消解、视图切换与重绘。
import { type Static, Type } from 'typebox'

import type { SymbolSpec } from '../../controllers/types'
import { COMPARISON_ERROR_CODES, KLineChartError } from '../../errors'
import {
  ASSET_CLASS_VALUES,
  type AssetClass,
  type InstrumentDescriptor,
} from '../../data/provider/types'
import { Tool } from '../../foundation/agent/chartToolRegistry'

import { symbolSpecIdentityKey } from './symbolIdentity'

// Type.Enum 保留 as const 数组的字面量联合推断；Type.Union(values.map(...)) 在 typebox 1.x 下推断为 never。
const AssetClassToolParameter = Type.Enum(ASSET_CLASS_VALUES)

const ComparisonCreateToolParameters = Type.Object(
  {
    symbol: Type.String({ minLength: 1 }),
    market: Type.Optional(Type.String({ minLength: 1 })),
    exchange: Type.Optional(Type.String({ minLength: 1 })),
    source: Type.Optional(Type.String({ minLength: 1 })),
    assetClass: Type.Optional(AssetClassToolParameter),
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

/**
 * 对比新增输入：Agent 只给窄字段，UI 可给完整 SymbolSpec。
 * 未提供的路由字段由主品种补齐，已提供的品种信息原样保留。
 * assetClass 只参与歧义消解，不进入品种 spec。
 */
export type ComparisonAddInput = Omit<ComparisonCreateInput, 'assetClass'> &
  Partial<Pick<SymbolSpec, 'id' | 'instrument' | 'params' | 'startDate' | 'endDate' | 'incremental'>>

/** 按代码解析品种的输入；source 省略时跨源查询。 */
export interface ComparisonInstrumentQuery {
  readonly symbol: string
  readonly source?: string
}

/** 品种解析结果：汇报全部精确匹配候选，裁决策略由 ComparisonCommands 持有。 */
export interface ComparisonInstrumentResolution {
  /** 代码的精确匹配候选；未找到时为空数组。 */
  readonly candidates: readonly InstrumentDescriptor[]
  /** 本次实际查询的数据源；空数组表示未限定、跨全部已启用源。 */
  readonly searchedSourceIds: readonly string[]
  /** 该代码存在但未被本次查询覆盖的数据源。 */
  readonly foundElsewhereSourceIds: readonly string[]
}

/** 歧义消解时的单个候选条目；路由字段可原样用作 comparison_create 的重试过滤参数。 */
export interface ComparisonCandidateView {
  readonly id: string
  readonly sourceId: string
  readonly symbol: string
  readonly name: string
  readonly exchange: string
  readonly assetClass: AssetClass
}

/** comparison_create 的结果：成功添加，或命中多个标的而拒绝写入并等待用户澄清。 */
export type ComparisonCreateResult =
  | { readonly status: 'added'; readonly symbol: string; readonly name: string }
  | {
      readonly status: 'ambiguous'
      readonly message: string
      readonly candidates: readonly ComparisonCandidateView[]
    }

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
  /** 将对比品种登记进可解析目录，供 UI picker 与后续操作复用。 */
  registerSpec(spec: SymbolSpec): void
  /** 按代码返回全部精确匹配品种描述，供消解策略过滤与裁决；未找到时候选为空。 */
  resolveInstrument(query: ComparisonInstrumentQuery): Promise<ComparisonInstrumentResolution>
  /** 返回指定对比品种的展示颜色。 */
  getColor(identity: string): string | undefined
  /** 请求重绘。 */
  scheduleDraw(): void
}

/** 对比品种的统一写原语契约。 */
export interface ComparisonCommandsApi {
  list(): ReadonlyArray<ComparisonSnapshot>
  add(input: ComparisonAddInput): boolean
  create(input: ComparisonCreateInput): Promise<ComparisonCreateResult>
  remove(input: ComparisonRemoveInput): boolean
  clear(): number
}

/**
 * 对比品种 CRUD 的唯一写入口：UI 与 Agent 调用同一实例。
 * 新增同时负责品种目录登记与完整 spec 保留，调用方不再手工补状态。
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

  /** 新增一个对比品种；多个标的命中时不写入并返回歧义结果，其余失败抛出可纠正错误。 */
  @Tool({
    name: 'comparison_create',
    label: 'Add comparison symbol',
    description:
      'Add one comparison symbol to the main chart. symbol is required and is resolved against the active market-data sources so the real exchange, id, and params are used; source, exchange, and assetClass restrict which instrument the code may resolve to. period and adjust default to the primary symbol when omitted. When several distinct instruments match, nothing is added and the result is { status: "ambiguous", candidates: [...] }: ask the user to choose with the ask_user tool, then retry with the chosen candidate\'s source, exchange, and assetClass. Never pick a candidate yourself. Fails with an actionable reason when the chart has no primary symbol, the symbol cannot be resolved, or it is already compared; an unknown market is rejected.',
    parameters: ComparisonCreateToolParameters,
    safety: 'destructive',
    executionMode: 'sequential',
  })
  async create(input: ComparisonCreateInput): Promise<ComparisonCreateResult> {
    const primary = this.primarySpec()
    if (!primary) throw noPrimaryComparisonError()
    const resolution = await this.dependencies.resolveInstrument({
      symbol: input.symbol,
      source: input.source ?? primary.source,
    })
    const { assetClass, ...specInput } = input
    const matches = filterInstrumentCandidates(resolution.candidates, assetClass, input.exchange)
    if (matches.length === 0) {
      throw instrumentNotFoundError(input.symbol, resolution, resolution.candidates.length > 0)
    }
    if (matches.length > 1) return ambiguousComparisonResult(input.symbol, matches)
    const instrument = matches[0]
    const spec = this.resolveSpec(specInput, primary, instrument)
    if (!this.write(primary, spec)) throw duplicateComparisonError(input.symbol)
    return Object.freeze({ status: 'added' as const, symbol: spec.symbol, name: instrument.name })
  }

  /**
   * 程序化新增入口：接受完整 SymbolSpec，保留 instrument/params/id 等品种信息。
   * 缺省路由字段由主品种补齐；重复品种（identity 或 symbol 命中）返回 false。
   */
  add(input: ComparisonAddInput): boolean {
    const primary = this.primarySpec()
    if (!primary) return false
    return this.write(primary, this.resolveSpec(input, primary, input.instrument ?? null))
  }

  /** 去重 → 校验 → 登记 → 原子写回 symbols → 切视图 → 重绘；重复返回 false。 */
  private write(primary: SymbolSpec, spec: SymbolSpec): boolean {
    const identity = symbolSpecIdentityKey(spec)
    const specs = this.comparisonSpecs()
    if (
      specs.some(
        (item) => symbolSpecIdentityKey(item) === identity || item.symbol === spec.symbol,
      )
    ) {
      return false
    }
    this.dependencies.validateSpec(spec)
    this.dependencies.registerSpec(spec)
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

  /** 用主品种补齐缺省字段；解析到完整 instrument 时以其为准补全路由字段。 */
  private resolveSpec(
    input: ComparisonAddInput,
    primary: SymbolSpec,
    instrument: InstrumentDescriptor | null,
  ): SymbolSpec {
    const base: SymbolSpec = {
      ...input,
      market: input.market ?? primary.market,
      exchange: input.exchange ?? primary.exchange,
      source: input.source ?? primary.source,
      period: input.period ?? primary.period,
      adjust: input.adjust ?? primary.adjust,
      startDate: input.startDate ?? primary.startDate,
      endDate: input.endDate ?? primary.endDate,
    }
    if (!instrument) return base
    return {
      ...base,
      id: base.id ?? instrument.id,
      instrument,
      symbol: instrument.symbol,
      market: instrument.sessionId ?? base.market,
      exchange: instrument.exchange,
      source: base.source ?? instrument.sourceId,
    }
  }
}

/** 缺少主品种时抛出，提示先加载主品种。 */
function noPrimaryComparisonError(): KLineChartError {
  return new KLineChartError(
    COMPARISON_ERROR_CODES.NO_PRIMARY,
    'The chart has no primary symbol loaded, so a comparison symbol cannot be added. Load a primary symbol first.',
  )
}

/** 对比品种已在列表中时抛出。 */
function duplicateComparisonError(symbol: string): KLineChartError {
  return new KLineChartError(
    COMPARISON_ERROR_CODES.DUPLICATE,
    `Symbol "${symbol}" is already compared on this chart. Use comparisons_list to review current comparisons, or pick a different symbol.`,
  )
}

/** 品种无法解析时抛出；区分「候选被用户约束过滤掉」与「彻底未找到」，都附带纠正路径。 */
function instrumentNotFoundError(
  symbol: string,
  resolution: ComparisonInstrumentResolution,
  candidatesFilteredOut: boolean,
): KLineChartError {
  const searched = resolution.searchedSourceIds.length
    ? resolution.searchedSourceIds.join(', ')
    : 'all enabled sources'
  if (candidatesFilteredOut) {
    const options = resolution.candidates
      .map((item) => `${item.assetClass}@${item.exchange} "${item.name}" (source ${item.sourceId})`)
      .join('; ')
    return new KLineChartError(
      COMPARISON_ERROR_CODES.INSTRUMENT_NOT_FOUND,
      `Symbol "${symbol}" exists but no instrument matches the given exchange/assetClass filters. Searched ${searched}. Actual matches: ${options}. Ask the user to confirm the intended instrument with the ask_user tool before retrying.`,
    )
  }
  const hint = resolution.foundElsewhereSourceIds.length
    ? ` It exists in: ${resolution.foundElsewhereSourceIds.join(', ')}. Retry comparison_create with source set to one of those.`
    : ' Use instruments_query_name to find the exact symbol.'
  return new KLineChartError(
    COMPARISON_ERROR_CODES.INSTRUMENT_NOT_FOUND,
    `No instrument matched symbol "${symbol}". Searched ${searched}.${hint}`,
  )
}

/** 按用户路由约束过滤精确匹配候选；exchange 大小写不敏感，未给约束时原样返回。 */
function filterInstrumentCandidates(
  candidates: readonly InstrumentDescriptor[],
  assetClass: AssetClass | undefined,
  exchange: string | undefined,
): readonly InstrumentDescriptor[] {
  const expectedExchange = exchange?.trim().toUpperCase()
  return candidates.filter(
    (item) =>
      (assetClass === undefined || item.assetClass === assetClass) &&
      (expectedExchange === undefined || item.exchange.toUpperCase() === expectedExchange),
  )
}

/** 多个标的命中时的歧义结果：不写入任何状态，强制 Agent 先向用户澄清。 */
function ambiguousComparisonResult(
  symbol: string,
  matches: readonly InstrumentDescriptor[],
): ComparisonCreateResult {
  return Object.freeze({
    status: 'ambiguous' as const,
    message: `Symbol "${symbol}" matched ${matches.length} instruments, so none was added. Use the ask_user tool to let the user choose one candidate, then retry comparison_create with that candidate's source, exchange, and assetClass.`,
    candidates: Object.freeze(
      matches.map((item) =>
        Object.freeze({
          id: item.id,
          sourceId: item.sourceId,
          symbol: item.symbol,
          name: item.name,
          exchange: item.exchange,
          assetClass: item.assetClass,
        }),
      ),
    ),
  })
}
