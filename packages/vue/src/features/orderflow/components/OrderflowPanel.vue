<!-- 订单流面板：把六块互相印证又互相打架的微观结构事实摆在一屏。 -->
<template>
  <section class="orderflow-panel" aria-label="订单流面板">
    <header class="of-header">
      <div class="of-header__title">
        <span class="of-symbol">{{ displaySymbol }}</span>
        <span class="of-perp-tag">永续</span>
        <span class="of-stale" :class="staleClass">{{ freshnessText }}</span>
      </div>
      <button
        type="button"
        class="of-refresh"
        :disabled="loading"
        :aria-label="loading ? '正在刷新' : '刷新面板'"
        @click="void refresh()"
      >
        {{ loading ? '刷新中' : '刷新' }}
      </button>
    </header>

    <p v-if="error !== null" class="of-error" role="alert">{{ error }}</p>
    <p v-else-if="panel === null" class="of-hint">正在读取面板…</p>

    <template v-else>
      <!-- ① 总览 -->
      <section class="of-card">
        <h3 class="of-card__title">① 总览</h3>
        <dl class="of-kv">
          <dt>持仓量</dt>
          <dd>
            {{ formatBase(panel.totals.openInterestBase) }}
            <span class="of-sub">{{ money(panel.totals.openInterestNotional) }}</span>
          </dd>
          <dt>1h 净流</dt>
          <dd :class="signClass(panel.totals.netFlow1h)">
            {{ signedMoney(panel.totals.netFlow1h) }}
          </dd>
          <dt>1h 主动买</dt>
          <dd>{{ percent(panel.totals.takerBuyRatio1h) }}</dd>
          <dt>±0.5% 失衡</dt>
          <dd :class="signClass(panel.totals.depthHalfPercent.imbalance)">
            {{ signedPercent(panel.totals.depthHalfPercent.imbalance) }}
          </dd>
          <dt>账户数多空比</dt>
          <dd>{{ ratioText(panel.totals.accountRatioMean) }}</dd>
          <dt>大户持仓多空比</dt>
          <dd>{{ ratioText(panel.totals.topPositionRatioMean) }}</dd>
        </dl>
        <p class="of-note">两种多空比口径不同，实测方向可以相反，不能合并看。</p>
      </section>

      <!-- ② 分场所资金流 -->
      <section class="of-card">
        <h3 class="of-card__title">② 分场所资金流（1h，官方聚合）</h3>
        <table class="of-table">
          <thead>
            <tr>
              <th>交易所</th>
              <th>净流</th>
              <th>主动买</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="venue in panel.venues" :key="venue.venue">
              <td>{{ venue.venue }}</td>
              <td :class="signClass(hourFlow(venue)?.netNotional ?? 0)">
                {{ hourFlow(venue) === null ? '—' : signedMoney(hourFlow(venue)?.netNotional ?? 0) }}
              </td>
              <td>{{ percent(hourFlow(venue)?.takerBuyRatio ?? null) }}</td>
            </tr>
          </tbody>
        </table>
        <p class="of-note">只有 Binance 与 OKX 提供官方 1 小时聚合，其余三家只有逐笔。</p>
      </section>

      <!-- ③ 分周期主动买 -->
      <section class="of-card">
        <h3 class="of-card__title">③ 主动买入占比（越短越贴近「刚刚」）</h3>
        <table class="of-table">
          <thead>
            <tr>
              <th>交易所</th>
              <th>1h</th>
              <th>15m</th>
              <th>5m</th>
              <th>1m</th>
              <th>口径</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="venue in panel.venues" :key="venue.venue">
              <td>{{ venue.venue }}</td>
              <td>{{ percent(windowRatio(venue, 3600)) }}</td>
              <td>{{ percent(windowRatio(venue, 900)) }}</td>
              <td>{{ percent(windowRatio(venue, 300)) }}</td>
              <td>{{ percent(windowRatio(venue, 60)) }}</td>
              <td class="of-dim">{{ granularityText(venue) }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- ④ 深度与价格墙 -->
      <section class="of-card">
        <h3 class="of-card__title">④ 深度（±0.5% 内挂单）</h3>
        <table class="of-table">
          <thead>
            <tr>
              <th>交易所</th>
              <th>买</th>
              <th>卖</th>
              <th>区间失衡</th>
              <th>近端失衡</th>
              <th>覆盖</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="venue in panel.venues" :key="venue.venue">
              <td>{{ venue.venue }}</td>
              <td>{{ money(bandOf(venue)?.bidNotional ?? 0) }}</td>
              <td>{{ money(bandOf(venue)?.askNotional ?? 0) }}</td>
              <td :class="signClass(bandOf(venue)?.imbalance ?? 0)">
                {{ signedPercent(bandOf(venue)?.imbalance ?? 0) }}
              </td>
              <td :class="signClass(venue.depth?.nearImbalance ?? 0)">
                {{ signedPercent(venue.depth?.nearImbalance ?? 0) }}
              </td>
              <td class="of-dim">{{ coverageText(venue) }}</td>
            </tr>
          </tbody>
        </table>
        <!-- 波动范围：单点深度噪声极大，实测两分钟内可以反向，必须给区间 -->
        <div class="of-range">
          <div v-for="venue in panel.venues" :key="venue.venue" class="of-range__row">
            <span class="of-range__label">{{ venue.venue }}</span>
            <span class="of-range__bar" :title="rangeTitle(venue.venue)">
              <span class="of-range__fill" :style="rangeStyle(venue.venue)"></span>
            </span>
            <span class="of-range__text">{{ rangeText(venue.venue) }}</span>
          </div>
        </div>
        <p class="of-note">上方为当前值，下方为最近 {{ RANGE_SAMPLES }} 次采样的近端失衡范围。</p>
      </section>

      <!-- ⑤ 持仓结构 -->
      <section class="of-card">
        <h3 class="of-card__title">⑤ 持仓结构</h3>
        <table class="of-table">
          <thead>
            <tr>
              <th>交易所</th>
              <th>OI</th>
              <th>名义额</th>
              <th>账户比</th>
              <th>大户持仓比</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="venue in panel.venues" :key="venue.venue">
              <td>{{ venue.venue }}</td>
              <td>{{ venue.positioning === null ? '—' : formatBase(venue.positioning.openInterestBase) }}</td>
              <td>{{ money(venue.positioning?.openInterestNotional ?? 0) }}</td>
              <td>{{ ratioText(venue.positioning?.accountRatio ?? null) }}</td>
              <td>{{ ratioText(venue.positioning?.topPositionRatio ?? null) }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- ⑥ 钟级大单 -->
      <section class="of-card">
        <h3 class="of-card__title">⑥ 大单分层</h3>
        <template v-if="largeOrderVenues.length > 0">
          <div v-for="venue in largeOrderVenues" :key="venue.venue" class="of-large">
            <p class="of-large__head">
              <span>{{ venue.venue }}</span>
              <span class="of-dim">{{ largeOrderScope(venue) }}</span>
            </p>
            <div
              v-for="bucket in venue.largeOrders?.buckets ?? []"
              :key="bucket.minNotional"
              class="of-large__row"
            >
              <span class="of-large__range">{{ bucketRange(bucket.minNotional, bucket.maxNotional) }}</span>
              <span class="of-large__share">{{ percent(bucket.share) }}</span>
              <span class="of-large__buy">主动买 {{ bucket.notional > 0 ? percent(bucket.takerBuyRatio) : '—' }}</span>
            </div>
          </div>
        </template>
        <p v-else class="of-hint">暂无钟级记录（整点封存后出现）。</p>
      </section>

      <!-- ⑦ 矛盾 -->
      <section class="of-card of-card--alert">
        <h3 class="of-card__title">⑦ 互相打架的证据</h3>
        <ul v-if="panel.contradictions.length > 0" class="of-list">
          <li v-for="item in panel.contradictions" :key="item.kind + item.detail">
            <span class="of-tag">{{ item.kind }}</span>
            {{ item.detail }}
          </li>
        </ul>
        <p v-else class="of-hint">未检出。各面板方向一致，或差异未超过阈值。</p>
      </section>
    </template>
  </section>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import type { DepthRange } from '../impl/use-orderflow-panel'
  import { useOrderflowPanel } from '../impl/use-orderflow-panel'
  import type { OrderflowPanelSource, VenueView } from '../types'

  const props = defineProps<{
    /** 面板数据来源 */
    source: OrderflowPanelSource
    /** 当前品种；返回 null 时停止刷新 */
    symbol: string | null
  }>()

  const state = useOrderflowPanel({
    source: props.source,
    symbol: () => props.symbol,
  })
  const panel = state.panel
  const loading = state.loading
  const error = state.error
  const refresh = state.refresh

  /** 波动范围采样次数上限，用于文案。 */
  const RANGE_SAMPLES = 10

  /** KCQ 的永续展示后缀；数据层不带它，只用于展示。 */
  const PERPETUAL_SUFFIX = '.P'

  /**
   * 面板展示的品种全名。
   *
   * 面板数据**全部来自永续合约**：深度用 `fapi.binance.com`、OKX 用 `BTC-USDT-SWAP`、
   * Bybit 用 `category=linear`、Bitget 用 `USDT-FUTURES`、Hyperliquid 只有永续。
   * 交易所在接口里把永续符号就叫 `BTCUSDT`（与现货同名），但 KCQ 的展示规范用 `.P` 区分，
   * 所以这里补上后缀并单独标「永续」——否则用户会以为看的是现货深度。
   */
  const displaySymbol = computed(() => `${props.symbol}${PERPETUAL_SUFFIX}`)

  /** 数据滞后阈值：超过它就把时间标黄。 */
  const STALE_MS = 10 * 60 * 1000

  const staleClass = computed(() => {
    const updated = state.lastUpdated.value
    if (updated === null) return ''
    return Date.now() - updated > STALE_MS ? 'of-stale--warn' : ''
  })

  const freshnessText = computed(() => {
    const updated = state.lastUpdated.value
    if (updated === null) return '未连接'
    const seconds = Math.round((Date.now() - updated) / 1000)
    if (seconds < 60) return `${seconds} 秒前更新`
    const minutes = Math.round(seconds / 60)
    return `${minutes} 分钟前更新`
  })

  const largeOrderVenues = computed<readonly VenueView[]>(
    () => panel.value?.venues.filter((venue) => venue.largeOrders !== null) ?? [],
  )

  /**
   * 金额格式化。
   *
   * @param value 金额
   * @returns 可读文本
   */
  function money(value: number): string {
    const abs = Math.abs(value)
    if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`
    if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)}M`
    if (abs >= 1e3) return `$${(value / 1e3).toFixed(0)}K`
    return `$${value.toFixed(0)}`
  }

  /**
   * 带符号金额。
   *
   * @param value 金额
   * @returns 可读文本
   */
  function signedMoney(value: number): string {
    return `${value >= 0 ? '+' : '−'}${money(Math.abs(value))}`
  }

  /**
   * 百分比。
   *
   * @param value 比例；null 显示破折号
   * @returns 可读文本
   */
  function percent(value: number | null | undefined): string {
    return value === null || value === undefined ? '—' : `${(value * 100).toFixed(1)}%`
  }

  /**
   * 带符号百分比。
   *
   * @param value 比例
   * @returns 可读文本
   */
  function signedPercent(value: number): string {
    return `${value >= 0 ? '+' : '−'}${(Math.abs(value) * 100).toFixed(1)}%`
  }

  /**
   * 多空比文本。
   *
   * @param value 比例
   * @returns 可读文本
   */
  function ratioText(value: number | null | undefined): string {
    return value === null || value === undefined ? '—' : value.toFixed(2)
  }

  /**
   * 持仓量格式化。
   *
   * @param value 币数量
   * @returns 可读文本
   */
  function formatBase(value: number): string {
    if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`
    if (value >= 1e3) return value.toFixed(0)
    return value.toFixed(2)
  }

  /**
   * 正负号对应的样式类。
   *
   * @param value 数值
   * @returns 样式类
   */
  function signClass(value: number): string {
    if (value > 0) return 'of-pos'
    if (value < 0) return 'of-neg'
    return ''
  }

  /**
   * 取某所的 1 小时成交；没有时返回 null。
   *
   * @param venue 单所快照
   * @returns 1 小时成交
   */
  function hourFlow(venue: VenueView) {
    return venue.flows.find((flow) => flow.windowSeconds === 3600) ?? null
  }

  /**
   * 取某所指定窗口的主动买占比。
   *
   * @param venue 单所快照
   * @param seconds 窗口秒数
   * @returns 比例
   */
  function windowRatio(venue: VenueView, seconds: number): number | null {
    return venue.flows.find((flow) => flow.windowSeconds === seconds)?.takerBuyRatio ?? null
  }

  /**
   * 成交口径说明。
   *
   * @param venue 单所快照
   * @returns 说明文本
   */
  function granularityText(venue: VenueView): string {
    const flow = venue.flows[0]
    if (flow === undefined) return '—'
    return flow.granularity === 'aggregated' ? '官方聚合' : '逐笔现算'
  }

  /**
   * 取 ±0.5% 区间统计。
   *
   * @param venue 单所快照
   * @returns 区间统计
   */
  function bandOf(venue: VenueView) {
    return venue.depth?.bands.find((band) => band.band === 0.5) ?? null
  }

  /**
   * 深度覆盖率文本。
   *
   * @param venue 单所快照
   * @returns 文本
   */
  function coverageText(venue: VenueView): string {
    if (venue.depth === null) return '—'
    return `−${venue.depth.bidCoveragePct.toFixed(2)}%/+${venue.depth.askCoveragePct.toFixed(2)}%`
  }

  /**
   * 取某所的深度波动范围。
   *
   * @param venue 交易所
   * @returns 范围
   */
  function rangeOf(venue: string): DepthRange | undefined {
    return state.depthRange.value.get(venue)
  }

  /**
   * 波动范围文本。
   *
   * @param venue 交易所
   * @returns 文本
   */
  function rangeText(venue: string): string {
    const range = rangeOf(venue)
    if (range === undefined || range.count < 2) return '积累中'
    return `${signedPercent(range.min)} → ${signedPercent(range.max)}`
  }

  /**
   * 波动范围提示。
   *
   * @param venue 交易所
   * @returns 提示文本
   */
  function rangeTitle(venue: string): string {
    const range = rangeOf(venue)
    return range === undefined ? '' : `最近 ${range.count} 次采样`
  }

  /**
   * 范围条的位置与宽度：把 −100%~+100% 映射到 0~100%。
   *
   * @param venue 交易所
   * @returns 内联样式
   */
  function rangeStyle(venue: string): Record<string, string> {
    const range = rangeOf(venue)
    if (range === undefined || range.count < 2) return { left: '50%', width: '0%' }
    const toPercent = (value: number): number => ((value + 1) / 2) * 100
    const left = Math.max(0, Math.min(100, toPercent(range.min)))
    const right = Math.max(0, Math.min(100, toPercent(range.max)))
    return { left: `${left}%`, width: `${Math.max(1, right - left)}%` }
  }

  /**
   * 大单口径说明。
   *
   * @param venue 单所快照
   * @returns 文本
   */
  function largeOrderScope(venue: VenueView): string {
    const profile = venue.largeOrders
    if (profile === null) return ''
    const hourly = profile.spanMs >= 3_600_000
    return hourly
      ? `整点封存 · ${profile.trades} 笔 · 主动买 ${percent(profile.takerBuyRatio)}`
      : `实时 ${profile.trades} 笔 · ${Math.round(profile.spanMs / 1000)}s · 主动买 ${percent(profile.takerBuyRatio)}`
  }

  /**
   * 分档区间文本。
   *
   * @param min 下界
   * @param max 上界
   * @returns 文本
   */
  function bucketRange(min: number, max: number | null): string {
    return max === null ? `≥${money(min)}` : `${money(min)}–${money(max)}`
  }
</script>

<style scoped>
  .orderflow-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    height: 100%;
    min-height: 0;
    overflow-y: auto;
    padding: 10px 12px 16px;
    font-size: 12px;
    color: var(--klc-color-ui-text);
    background: var(--klc-color-ui-background);
  }

  .of-header {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding-bottom: 8px;
    background: var(--klc-color-ui-background);
    border-bottom: 1px solid var(--klc-color-ui-border);
  }

  .of-header__title {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }

  .of-symbol {
    font-weight: 600;
    font-size: 13px;
  }

  /* 「永续」标签紧跟在品种名后，避免把永续深度误读成现货深度 */
  .of-perp-tag {
    padding: 0 4px;
    font-size: 10px;
    line-height: 15px;
    border-radius: 3px;
    border: 1px solid var(--klc-color-ui-border);
    opacity: 0.7;
  }

  .of-stale {
    font-size: 11px;
    color: var(--klc-color-ui-text);
    opacity: 0.6;
  }

  .of-stale--warn {
    color: var(--klc-color-candle-up-body);
    opacity: 1;
  }

  .of-refresh {
    flex: none;
    padding: 3px 10px;
    font-size: 11px;
    color: var(--klc-color-ui-text);
    background: var(--klc-color-ui-surface);
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 4px;
    cursor: pointer;
  }

  .of-refresh:hover:not(:disabled) {
    background: var(--klc-color-ui-hover);
  }

  .of-refresh:disabled {
    cursor: default;
    opacity: 0.6;
  }

  .of-card {
    padding: 10px;
    background: var(--klc-color-ui-surface);
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 6px;
  }

  .of-card--alert {
    border-color: var(--klc-color-candle-up-body);
  }

  .of-card__title {
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 600;
  }

  .of-kv {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 12px;
    margin: 0;
  }

  .of-kv dt {
    opacity: 0.7;
  }

  .of-kv dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
  }

  .of-sub {
    margin-left: 6px;
    opacity: 0.6;
  }

  .of-table {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }

  .of-table th {
    padding: 2px 4px;
    font-weight: 500;
    text-align: right;
    opacity: 0.6;
    border-bottom: 1px solid var(--klc-color-ui-border);
  }

  .of-table th:first-child,
  .of-table td:first-child {
    text-align: left;
  }

  .of-table td {
    padding: 3px 4px;
    text-align: right;
    white-space: nowrap;
  }

  .of-pos {
    color: var(--klc-color-candle-up-body);
  }

  .of-neg {
    color: var(--klc-color-candle-down-body);
  }

  .of-dim {
    opacity: 0.6;
    font-size: 11px;
  }

  .of-note {
    margin: 8px 0 0;
    font-size: 11px;
    line-height: 1.5;
    opacity: 0.6;
  }

  .of-hint {
    margin: 0;
    font-size: 11px;
    opacity: 0.6;
  }

  .of-error {
    margin: 0;
    padding: 8px;
    font-size: 11px;
    line-height: 1.5;
    border-radius: 4px;
    border: 1px solid var(--klc-color-candle-up-body);
  }

  .of-range {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-top: 8px;
  }

  .of-range__row {
    display: grid;
    grid-template-columns: 72px 1fr auto;
    align-items: center;
    gap: 8px;
  }

  .of-range__label,
  .of-range__text {
    font-size: 11px;
    opacity: 0.75;
    font-variant-numeric: tabular-nums;
  }

  .of-range__bar {
    position: relative;
    height: 4px;
    border-radius: 2px;
    background: var(--klc-color-ui-border);
  }

  .of-range__fill {
    position: absolute;
    top: 0;
    height: 100%;
    border-radius: 2px;
    background: var(--klc-color-ui-focus);
  }

  .of-large {
    margin-bottom: 10px;
  }

  .of-large:last-child {
    margin-bottom: 0;
  }

  .of-large__head {
    display: flex;
    justify-content: space-between;
    margin: 0 0 4px;
    font-weight: 500;
  }

  .of-large__row {
    display: grid;
    grid-template-columns: 1fr 48px 96px;
    gap: 8px;
    padding: 1px 0;
    font-variant-numeric: tabular-nums;
  }

  .of-large__share,
  .of-large__buy {
    text-align: right;
  }

  .of-list {
    margin: 0;
    padding-left: 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    line-height: 1.5;
  }

  .of-tag {
    display: inline-block;
    margin-right: 6px;
    padding: 0 4px;
    font-size: 10px;
    border-radius: 3px;
    border: 1px solid var(--klc-color-ui-border);
  }
</style>
