// 本文件实现对比品种的统一写原语：消歧、去重、显隐与重绘只有一个入口。
import type { SymbolSpec } from '../../controllers/types.js'
import { matchesInstrumentFilter } from '../../data/provider/instrumentSearch.js'
import type {
  InstrumentDescriptor,
  InstrumentRef,
  InstrumentType,
  KnownInstrumentType,
} from '../../data/provider/types.js'
import { isFilterableInstrumentType } from '../../data/provider/types.js'
import { COMPARISON_ERROR_CODES, ERROR_CODES, KLineChartError } from '../../errors.js'

import { DEFAULT_COMPARISON_COLOR } from '../chartModel/impl/comparison/comparisonState.js'
import { symbolSpecIdentityKey } from './symbolIdentity.js'

/** 同一代码命中多个标的时的候选；路由字段可原样回传给 create。 */
export interface ComparisonCandidate {
  readonly symbol: string
  readonly name: string
  readonly exchange: string
  readonly source: string
  /** 类别未归一化时省略，避免把 unknown 当成筛选条件。 */
  readonly instrumentType?: KnownInstrumentType
}

/** 对比品种快照；spec 供图例展示，visible 是用户可见状态。 */
export interface ComparisonSnapshot {
  readonly identity: string
  readonly spec: SymbolSpec
  readonly color: string
  readonly visible: boolean
}

/** 对比创建结果：成功写入，或未写入并等待用户裁决。 */
export type ComparisonCreateResult =
  | { readonly status: 'added'; readonly comparison: ComparisonSnapshot }
  | { readonly status: 'ambiguous'; readonly candidates: ReadonlyArray<ComparisonCandidate> }

/** 品种解析结果：候选、实际查询的源、其他源的命中与失败。 */
export interface ComparisonInstrumentResolution {
  /** 本次查询范围内该代码的全部精确匹配。 */
  readonly candidates: ReadonlyArray<InstrumentDescriptor>
  /** 本次实际参与查询的源。 */
  readonly searchedSources: ReadonlyArray<string>
  /** 被 source 限定排除、但仍存在该代码的源。 */
  readonly foundElsewhereSources: ReadonlyArray<string>
  /** 查询失败的源；不能把失败当成“没有”。 */
  readonly failedSources: ReadonlyArray<string>
}

/** 对比命令运行所需的领域能力，不依赖 DOM 或 renderer。 */
export interface ComparisonCommandsDependencies {
  /** 当前对比品种快照。 */
  getSpecs(): ReadonlyArray<SymbolSpec>
  /** 原子写回对比品种选择；实现负责同步对比颜色。 */
  setSpecs(next: ReadonlyArray<SymbolSpec>): void
  /** 将对比品种登记进可解析目录，供 UI picker 与后续操作复用。 */
  registerSpec(spec: SymbolSpec): void
  /** 按路由字段解析品种；限定源未命中时再跨全部源确认是否存在。 */
  resolveInstrument(
    query: InstrumentRef,
    signal?: AbortSignal,
  ): Promise<ComparisonInstrumentResolution>
  /** 对比线是否被用户隐藏。 */
  isHidden(identity: string): boolean
  /** 写入显隐状态；实现负责同步 kernel 状态。 */
  setHidden(identity: string, hidden: boolean): void
  /** 指定对比品种的展示颜色。 */
  getColor(identity: string): string | undefined
  /** 请求重绘。 */
  scheduleDraw(): void
}

/** 对比品种的统一写原语契约。 */
export interface ComparisonCommandsApi {
  list(): ReadonlyArray<ComparisonSnapshot>
  /** Agent 路径：按路由字段解析后写入；歧义返回候选。 */
  create(input: InstrumentRef, signal?: AbortSignal): Promise<ComparisonCreateResult>
  /** 宿主/图例路径：接受已解析的完整 spec；返回是否写入。 */
  add(input: SymbolSpec, primary?: SymbolSpec | null): boolean
  setVisible(identity: string, visible: boolean): ComparisonSnapshot
  remove(target: string): ComparisonSnapshot
}

/**
 * 对比品种 CRUD 的唯一写入口：UI 与 Agent 调用同一实例。
 * 对比集合写入 comparisonState.specs（唯一 SSOT）；周期与复权恒随主图，
 * 不进入对比 spec，避免 Agent 与 UI 各自维护一套口径。
 */
export class ComparisonCommands implements ComparisonCommandsApi {
  constructor(private readonly dependencies: ComparisonCommandsDependencies) {}

  /** 返回当前全部对比品种及其颜色与可见性。 */
  list(): ReadonlyArray<ComparisonSnapshot> {
    return this.comparisonSpecs().map((spec) => this.snapshot(spec))
  }

  /** 新增对比品种；零匹配抛可纠正错误，多匹配返回候选交由用户裁决。 */
  async create(input: InstrumentRef, signal?: AbortSignal): Promise<ComparisonCreateResult> {
    signal?.throwIfAborted()
    const resolution = await this.dependencies.resolveInstrument(input, signal)
    signal?.throwIfAborted()

    const matches = filterInstrumentCandidates(
      resolution.candidates,
      input.exchange,
      input.instrumentType,
    )
    if (matches.length === 0) {
      // 有源失败时不能宣称“不存在”，先让模型重试失败的源。
      if (resolution.failedSources.length > 0)
        throw sourceUnavailableError(input.symbol, resolution)
      throw instrumentNotFoundError(input.symbol, resolution, resolution.candidates)
    }
    if (matches.length > 1) return ambiguousComparisonResult(input.symbol, matches)

    const spec = this.specFromInstrument(matches[0]!)
    const existing = this.write(spec)
    if (existing !== null) throw duplicateComparisonError(spec, existing)
    return { status: 'added', comparison: this.snapshot(spec) }
  }

  /**
   * 程序化新增入口：接受完整 SymbolSpec，保留 instrument/params/id 等品种信息。
   * 缺省路由字段由调用方显式传入的主品种补齐；重复品种返回 false。
   */
  add(input: SymbolSpec, primary?: SymbolSpec | null): boolean {
    return this.write(this.resolveSpec(input, primary ?? null)) === null
  }

  /** 切换对比线可见性；只保留选择与数据，不改变排序。 */
  setVisible(identity: string, visible: boolean): ComparisonSnapshot {
    const spec = this.requireSpec(identity)
    this.dependencies.setHidden(identity, !visible)
    this.dependencies.scheduleDraw()
    return this.snapshot(spec)
  }

  /**
   * 按 identity 或品种代码删除一个对比品种。
   *
   * 工具层只用 identity；保留代码匹配是因为公开的 ChartController 历史上按代码删除。
   */
  remove(target: string): ComparisonSnapshot {
    const specs = this.comparisonSpecs()
    const spec =
      specs.find((item) => symbolSpecIdentityKey(item) === target) ??
      specs.find((item) => item.instrument.symbol === target)
    if (!spec) throw comparisonNotFound(target)
    const snapshot = this.snapshot(spec)
    this.dependencies.setSpecs(specs.filter((item) => item !== spec))
    this.dependencies.scheduleDraw()
    return snapshot
  }

  /**
   * 去重、登记并原子写入比较叠加集合。
   *
   * @returns 写入成功为 null；命中重复时返回与之冲突的既有 spec。
   */
  private write(spec: SymbolSpec): SymbolSpec | null {
    const identity = symbolSpecIdentityKey(spec)
    const specs = this.comparisonSpecs()
    const existing = specs.find((item) => symbolSpecIdentityKey(item) === identity)
    if (existing !== undefined) return existing
    this.dependencies.registerSpec(spec)
    this.dependencies.setSpecs([...specs, spec])
    this.dependencies.scheduleDraw()
    return null
  }

  /** 用解析出的品种生成对比 spec；周期与复权由取数层按主图注入。 */
  private specFromInstrument(instrument: InstrumentDescriptor): SymbolSpec {
    return { instrument }
  }

  /** 对比 spec 只保留品种与日期边界；周期与复权恒由主图在取数层注入。 */
  private resolveSpec(input: SymbolSpec, primary: SymbolSpec | null): SymbolSpec {
    const startDate = input.startDate ?? primary?.startDate
    const endDate = input.endDate ?? primary?.endDate
    return {
      instrument: input.instrument,
      ...(startDate === undefined ? {} : { startDate }),
      ...(endDate === undefined ? {} : { endDate }),
      ...(input.incremental === undefined ? {} : { incremental: input.incremental }),
    }
  }

  /** 按 identity 取 spec；缺失时抛可纠正错误。 */
  private requireSpec(identity: string): SymbolSpec {
    const spec = this.comparisonSpecs().find((item) => symbolSpecIdentityKey(item) === identity)
    if (!spec) throw comparisonNotFound(identity)
    return spec
  }

  /** 对比品种当前快照（已冻结副本）。 */
  private comparisonSpecs(): SymbolSpec[] {
    return this.dependencies.getSpecs().map((spec) => ({ ...spec }))
  }

  /** 投影为带颜色与可见性的快照；spec 以冻结副本返回，调用方不能反向改状态。 */
  private snapshot(spec: SymbolSpec): ComparisonSnapshot {
    const identity = symbolSpecIdentityKey(spec)
    return Object.freeze({
      identity,
      spec: Object.freeze({ ...spec }),
      color: this.dependencies.getColor(identity) ?? DEFAULT_COMPARISON_COLOR,
      visible: !this.dependencies.isHidden(identity),
    })
  }
}

/** 按用户路由约束过滤精确匹配候选；规则由 instrumentSearch 统一持有。 */
function filterInstrumentCandidates(
  candidates: ReadonlyArray<InstrumentDescriptor>,
  exchange: string | undefined,
  instrumentType: InstrumentType | undefined,
): ReadonlyArray<InstrumentDescriptor> {
  return candidates.filter((item) => matchesInstrumentFilter(item, { exchange, instrumentType }))
}

/** 品种无法解析时抛出；区分“被过滤器排除”“其他源存在”“查询失败”三种纠正路径。 */
function instrumentNotFoundError(
  symbol: string,
  resolution: ComparisonInstrumentResolution,
  actualMatches: ReadonlyArray<InstrumentDescriptor>,
): KLineChartError {
  const searched = resolution.searchedSources.join(', ') || 'none'
  if (actualMatches.length > 0) {
    const options = actualMatches
      .map(
        (item) => `${item.instrumentType}@${item.exchange} "${item.name}" (source ${item.source})`,
      )
      .join('; ')
    return new KLineChartError(
      COMPARISON_ERROR_CODES.INSTRUMENT_NOT_FOUND,
      `Symbol "${symbol}" exists but no instrument matches the given exchange/instrumentType filters. Searched: ${searched}. Actual matches: ${options}.`,
      {
        details: { symbol, searchedSources: [...resolution.searchedSources], candidates: options },
      },
    )
  }
  if (resolution.foundElsewhereSources.length > 0) {
    return new KLineChartError(
      COMPARISON_ERROR_CODES.INSTRUMENT_NOT_FOUND,
      `No instrument matched symbol "${symbol}" in source ${searched}, but it exists in: ${resolution.foundElsewhereSources.join(', ')}. Retry with source set to one of them.`,
      {
        details: {
          symbol,
          searchedSources: [...resolution.searchedSources],
          foundElsewhereSources: [...resolution.foundElsewhereSources],
        },
      },
    )
  }
  return new KLineChartError(
    COMPARISON_ERROR_CODES.INSTRUMENT_NOT_FOUND,
    `No instrument matched symbol "${symbol}". Searched: ${searched}. Use instruments_query to find the exact symbol.`,
    { details: { symbol, searchedSources: [...resolution.searchedSources] } },
  )
}

/** 有源查询失败且没有命中时不能宣称“不存在”：明确失败源并允许重试。 */
function sourceUnavailableError(
  symbol: string,
  resolution: ComparisonInstrumentResolution,
): KLineChartError {
  return new KLineChartError(
    ERROR_CODES.FETCH_FAILED,
    `Instrument lookup for "${symbol}" failed for source ${resolution.failedSources.join(', ')}; the symbol may exist there.`,
    {
      details: {
        symbol,
        searchedSources: [...resolution.searchedSources],
        failedSources: [...resolution.failedSources],
      },
    },
  )
}

/** 多个标的命中时的歧义结果：不写入任何状态，强制 Agent 先向用户澄清。 */
function ambiguousComparisonResult(
  symbol: string,
  matches: ReadonlyArray<InstrumentDescriptor>,
): ComparisonCreateResult {
  return Object.freeze({
    status: 'ambiguous' as const,
    candidates: Object.freeze(matches.map(toCandidate)),
  })
}

/** 候选只暴露可回传的路由字段；类别未归一化时不出现 instrumentType。 */
function toCandidate(instrument: InstrumentDescriptor): ComparisonCandidate {
  return Object.freeze({
    symbol: instrument.symbol,
    name: instrument.name,
    exchange: instrument.exchange,
    source: instrument.source,
    ...(isFilterableInstrumentType(instrument.instrumentType)
      ? { instrumentType: instrument.instrumentType }
      : {}),
  })
}

/** 对比品种已在列表中时抛出；details 带上既有身份，模型可直接更新或删除。 */
function duplicateComparisonError(spec: SymbolSpec, existing: SymbolSpec): KLineChartError {
  return new KLineChartError(
    COMPARISON_ERROR_CODES.DUPLICATE,
    `Comparison "${spec.instrument.symbol}" is already on the chart.`,
    {
      details: {
        symbol: spec.instrument.symbol,
        identity: symbolSpecIdentityKey(existing),
        source: spec.instrument.source,
      },
    },
  )
}

/** identity 不存在时抛出；提示先读取当前列表。 */
function comparisonNotFound(identity: string): KLineChartError {
  return new KLineChartError(
    COMPARISON_ERROR_CODES.NOT_FOUND,
    `No comparison matches identity "${identity}".`,
    { details: { identity } },
  )
}
