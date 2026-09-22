/**
 * Footprint Chart — public type contract.
 *
 * A Footprint chart expands each candle internally to show, at every price
 * level, how much aggressive buying (lifting the ASK) and aggressive selling
 * (hitting the BID) traded. It is the core tool of "order flow" reading:
 * traders use it to answer "did this bar rise because there were real buyers,
 * or only because sellers withdrew?".
 *
 * This module owns the **data model + classification math only**. Rendering
 * belongs to the `@klinechart-quant/core` Renderer/Scene layer; the planned
 * GPU compute path is sketched in `computeShader.wgsl.md`.
 *
 * See `docs/ROADMAP.md` §3.3 (Footprint) for the algorithm rationale and §0
 * for how this controller fits the seven-module core layering.
 *
 * Cross-references:
 *   - `impl/aggressor.ts`   — buy/sell classification (explicit, tick rule, Lee-Ready)
 *   - `impl/perBarStats.ts` — delta, cumulative delta, diagonal imbalance
 *   - `impl/createFootprintController.ts` — streaming controller (Signal<bars>)
 */

import type { Signal } from '../../foundation/reactivity/index.js'

// ---------------------------------------------------------------------------
// Aggressor classification — shared with `aggressor.ts`
// ---------------------------------------------------------------------------

/**
 * Which side of the resting book a trade hit.
 *
 *   - 'buy'  — aggressor lifted the ASK (resting seller was passive)
 *   - 'sell' — aggressor hit the BID  (resting buyer was passive)
 *
 * Note: this is the **aggressor**'s side, NOT the "buyer"'s side. Binance's
 * `isBuyerMaker=true` means the buyer was the maker (passive) and so the
 * aggressor is the seller — see `classifyExplicit` in `aggressor.ts`.
 */
export type AggressorSide = 'buy' | 'sell'

/**
 * A classification's confidence flag.
 *
 *   - `inferred: false` — derived from an explicit exchange flag (zero error)
 *   - `inferred: true`  — derived from a heuristic (tick rule or Lee-Ready);
 *                         the consumer should mark this as approximate so it
 *                         can be visually distinguished and excluded from
 *                         strict order-flow analytics
 *
 * Every classifier in `aggressor.ts` must set this honestly. We rely on it
 * downstream when surfacing "(estimated)" warnings on bars whose flow was
 * inferred — this is the explicit boundary mandated by ROADMAP §3.3.
 */
export interface AggressorWithConfidence {
  side: AggressorSide
  inferred: boolean
}

/**
 * 分类器的输出。
 *
 * `side` 为 `'unknown'` 仅表示确实没有可判断的依据（例如 tick rule 序列的第一笔）；
 * controller 应把 `'unknown'` 视为“丢弃该笔成交”，不能默认成 'buy' 或 'sell'。
 *
 * `inferred=false` 表示 side 来自交易所标志（零误差）；
 * `inferred=true` 表示来自启发式估计，下游 UI 应标注为近似。
 */
export interface AggressorResult {
  side: AggressorSide | 'unknown'
  inferred: boolean
}

/**
 * tick rule 在连续成交间携带的状态。分类器会**原地修改**它，
 * 因此每条流（多品种时每品种）应各自持有一份实例。
 */
export interface TickRuleState {
  prevPrice: number | null
  prevSide: AggressorSide | null
}

/**
 * Lee-Ready 复用 tick rule 的状态字段——两种启发式共用一个状态记录，
 * 因为 Lee-Ready 命中中间价时会回退到 tick rule。
 */
export interface LeeReadyState extends TickRuleState {}

// ---------------------------------------------------------------------------
// Trade inputs
// ---------------------------------------------------------------------------

/**
 * A single trade print. The minimum shape needed for footprint aggregation.
 *
 * `timestamp` is epoch ms (chosen because `Math.floor(ts / barIntervalMs)`
 * cleanly produces a bar index). `size` is in base units (BTC, AAPL shares,
 * not USD value).
 */
export interface Trade {
  timestamp: number
  price: number
  size: number
}

/**
 * A trade carrying the exchange's aggressor flag. Binance-style:
 * `isBuyerMaker=true` ⇒ the buyer was the passive maker, so the SELLER was
 * the aggressor. Optional — if the exchange does not include it the
 * controller falls back to the configured heuristic classifier.
 */
export interface TradeWithFlag extends Trade {
  isBuyerMaker?: boolean
}

// ---------------------------------------------------------------------------
// Bar shape
// ---------------------------------------------------------------------------

/**
 * One price level inside a footprint bar.
 *
 * Cells are sorted by `price` ascending. `askVol` and `bidVol` are gross
 * (not net) — the delta is computed separately.
 */
export interface FootprintBarCell {
  /** representative price of the bin (quantised to tickSize). */
  price: number
  /** volume of trades classified as `buy` (aggressor lifted the ASK). */
  askVol: number
  /** volume of trades classified as `sell` (aggressor hit the BID). */
  bidVol: number
}

/**
 * Direction of a diagonal imbalance — see `perBarStats.ts` for the math.
 */
export type ImbalanceDirection = 'buy-imbalance' | 'sell-imbalance'

/**
 * One imbalance flag inside a bar.
 *
 * `priceIndex` is the index into `FootprintBar.cells` of the dominant side
 * (not the cell it was compared against). `ratio` is `dominant / weaker`
 * (always ≥ the configured threshold; capped at `Number.POSITIVE_INFINITY`
 * when the weaker side is zero — see `computeDiagonalImbalances`).
 */
export interface FootprintImbalance {
  priceIndex: number
  direction: ImbalanceDirection
  ratio: number
}

/**
 * The materialised view of one bar (the unit a renderer consumes).
 *
 * All fields are derived from the controller's internal streaming aggregate;
 * `cells` and `imbalances` are recomputed lazily on `bars` signal read.
 */
export interface FootprintBar {
  /** stable index = `Math.floor(timestamp / barIntervalMs)`. */
  barIndex: number
  /** inclusive start of the bar window (epoch ms). */
  startTime: number
  /** exclusive end of the bar window (epoch ms). */
  endTime: number
  /** per-price-level cells, ascending by `price`. */
  cells: ReadonlyArray<FootprintBarCell>
  /** Σ(askVol − bidVol) across cells. Positive ⇒ buyers led. */
  delta: number
  /** Σ(askVol + bidVol). */
  totalVolume: number
  /** diagonal imbalance flags; usually 0–5 per bar. */
  imbalances: ReadonlyArray<FootprintImbalance>
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Controller config. All fields required at the controller surface — the
 * factory fills missing fields with sensible defaults so callers can pass
 * a partial.
 */
export interface FootprintConfig {
  /** quantise trade prices to this tick size (e.g. 0.01 for BTCUSDT). */
  tickSize: number
  /** ms per bar (e.g. 60_000 for 1m). */
  barIntervalMs: number
  /**
   * Diagonal imbalance threshold. Default 3 — i.e. a cell must have at
   * least 3× the volume of its diagonal counterpart to flag.
   */
  imbalanceRatio: number
  /**
   * Classifier to fall back to when a trade has no explicit
   * `isBuyerMaker` flag.
   *
   *   - 'tick-rule' — price-change rule; default. Doesn't need bid/ask.
   *   - 'lee-ready' — uses bid/ask; controller's `ingestTrade` must
   *                   receive `bid` and `ask` for this path.
   */
  fallbackClassifier: 'tick-rule' | 'lee-ready'
}

// ---------------------------------------------------------------------------
// Controller interface
// ---------------------------------------------------------------------------

/**
 * Framework-agnostic controller — mirrors `IndicatorSelectorController`'s
 * shape (signals for state, plain functions for mutations, idempotent
 * `dispose`).
 */
export interface FootprintController {
  /** Current config; re-emits when `setConfig` is called. */
  readonly config: Signal<FootprintConfig>
  /** Materialised bars, ascending by `barIndex`. Empty before first trade. */
  readonly bars: Signal<ReadonlyArray<FootprintBar>>
  /**
   * Cumulative delta series, parallel to `bars`. `cumulativeDelta[i]`
   * corresponds to `bars[i]`.
   */
  readonly cumulativeDelta: Signal<ReadonlyArray<number>>

  /**
   * Ingest one trade — canonical method, aligned with the cross-controller
   * `ingest()` convention (VolumeProfile, OrderBookHeatmap). `bid`/`ask` are
   * optional and only consulted when the trade lacks an explicit
   * `isBuyerMaker` flag AND the configured fallback is `lee-ready`.
   *
   * Closes API-audit BLOCKER-001 (5-verb intake proliferation) by
   * harmonising on `ingest` as the stream-accumulator verb across
   * `VolumeProfile`, `OrderBookHeatmap`, and `Footprint`.
   */
  ingest(trade: TradeWithFlag, bid?: number, ask?: number): void

  /**
   * @deprecated since 0.1.0-alpha.1 — use {@link FootprintController.ingest}.
   * Kept as a non-removing alias for at least 6 months for migration. Will
   * be removed in 0.2.0.
   */
  ingestTrade(trade: TradeWithFlag, bid?: number, ask?: number): void

  /**
   * Patch the config. Changing `barIntervalMs` or `tickSize` invalidates
   * the buckets so the state is cleared. Changing only `imbalanceRatio`
   * just re-materialises on the next read.
   */
  setConfig(next: Partial<FootprintConfig>): void

  /** Clear all bars and cumulative delta. Does not change config. */
  reset(): void

  /**
   * Stop emitting. Subsequent calls to ingest/setConfig/reset are silent
   * no-ops; previously-attached subscribers receive no further
   * notifications. Idempotent.
   */
  dispose(): void
}
