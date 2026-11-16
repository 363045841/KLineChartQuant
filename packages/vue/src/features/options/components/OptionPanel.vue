<!-- 期权关键位面板：把主图那三条水位的数字版摆在订单流旁边。 -->
<template>
  <section class="option-panel" aria-label="期权关键位面板">
    <header class="op-header">
      <div class="op-header__title">
        <span class="op-symbol">{{ title }}</span>
        <span class="op-stale" :class="staleClass">{{ freshnessText }}</span>
      </div>
      <div class="op-header__actions">
        <span class="op-status" :class="`op-status--${statusTone}`" role="status" :title="statusLabel" :aria-label="statusLabel" />
        <button
          type="button"
          class="op-refresh"
          :disabled="loading"
          :aria-label="loading ? '正在刷新' : '刷新面板'"
          @click="void refresh()"
        >
          {{ loading ? '刷新中' : '刷新' }}
        </button>
      </div>
    </header>

    <p v-if="error !== null" class="op-error" role="alert">{{ error }}</p>
    <p v-else-if="view === null" class="op-hint">正在读取期权数据…</p>

    <template v-else>
      <!-- ① 关键位 -->
      <section class="op-card">
        <h3 class="op-card__title">① 关键位</h3>
        <table class="op-table">
          <thead>
            <tr>
              <th>项目</th>
              <th>价位</th>
              <th>距现价</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Gamma 翻转</td>
              <td>{{ priceText(view.gammaFlipUsd) }}</td>
              <td>{{ gapText(view.gammaFlipUsd) }}</td>
            </tr>
            <tr>
              <td>Call 墙（Γ 加权）</td>
              <td class="op-wall--call">{{ priceText(view.nearTerm.callGammaWall?.strike ?? null) }}</td>
              <td class="op-wall--call">{{ gapText(view.nearTerm.callGammaWall?.strike ?? null) }}</td>
            </tr>
            <tr>
              <td>Put 墙（Γ 加权）</td>
              <td class="op-wall--put">{{ priceText(view.nearTerm.putGammaWall?.strike ?? null) }}</td>
              <td class="op-wall--put">{{ gapText(view.nearTerm.putGammaWall?.strike ?? null) }}</td>
            </tr>
            <tr>
              <td>Call 墙（OI）</td>
              <td class="op-wall--call">{{ priceText(view.nearTerm.callWall?.strike ?? null) }}</td>
              <td class="op-wall--call">{{ gapText(view.nearTerm.callWall?.strike ?? null) }}</td>
            </tr>
            <tr>
              <td>Put 墙（OI）</td>
              <td class="op-wall--put">{{ priceText(view.nearTerm.putWall?.strike ?? null) }}</td>
              <td class="op-wall--put">{{ gapText(view.nearTerm.putWall?.strike ?? null) }}</td>
            </tr>
            <tr>
              <td>最大痛点</td>
              <td>{{ priceText(view.nearTerm.maxPainUsd) }}</td>
              <td>{{ gapText(view.nearTerm.maxPainUsd) }}</td>
            </tr>
          </tbody>
        </table>
        <p class="op-note">
          Γ 加权墙取 OI×Γ 合计最大的行权价，读的是日内对冲火力；OI 墙取该方向持仓最集中的行权价。
          翻转位是净 GEX 过零的现价，偏离现价超过 10% 判为无效。
        </p>
      </section>

      <!-- ② 波动 -->
      <section class="op-card">
        <h3 class="op-card__title">② 近月波动</h3>
        <dl class="op-kv">
          <dt>现货指数</dt>
          <dd>{{ priceText(view.spotIndex) }}</dd>
          <dt>ATM IV</dt>
          <dd>{{ percentText(view.nearTerm.atmIvPercent) }}</dd>
          <dt>剩余天数</dt>
          <dd>{{ dteText(view.nearTerm.dteDays) }}</dd>
          <dt>到期日</dt>
          <dd>{{ view.nearTerm.expiryIso ?? '—' }}</dd>
          <dt>±1σ</dt>
          <dd>{{ rangeText(view.nearTerm.sigmaLowerUsd, view.nearTerm.sigmaUpperUsd) }}</dd>
          <dt>±2σ</dt>
          <dd>{{ rangeText(view.nearTerm.sigma2LowerUsd, view.nearTerm.sigma2UpperUsd) }}</dd>
        </dl>
        <p class="op-stats">{{ volatilityLine }}</p>
      </section>

      <!-- ③ 持仓 -->
      <section class="op-card">
        <h3 class="op-card__title">③ 持仓与 gamma 敞口</h3>
        <table class="op-table">
          <thead>
            <tr>
              <th>口径</th>
              <th>净 GEX</th>
              <th>P/C</th>
              <th>持仓</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>近月</td>
              <td :class="signClass(view.nearTerm.netGexUsdPerPercent)">
                {{ gexText(view.nearTerm.netGexUsdPerPercent) }}
              </td>
              <td>{{ ratioText(view.nearTerm.putCallOiRatio) }}</td>
              <td>{{ openInterestText(view.nearTerm.totalOpenInterest) }}</td>
            </tr>
            <tr>
              <td>全链</td>
              <td :class="signClass(view.allChain.netGexUsdPerPercent)">
                {{ gexText(view.allChain.netGexUsdPerPercent) }}
              </td>
              <td>{{ ratioText(view.allChain.putCallOiRatio) }}</td>
              <td>{{ openInterestText(view.allChain.totalOpenInterest) }}</td>
            </tr>
          </tbody>
        </table>
        <p class="op-note">
          净 GEX 单位是「每 1% 价格变动的美元敞口」；P/C 为 Put 与 Call 未平仓量之比。
        </p>
      </section>

      <!-- ④ 一句话解读 -->
      <section class="op-card">
        <h3 class="op-card__title">④ 结构判断</h3>
        <div v-if="reading" class="op-structure">
          <p class="op-structure__line">
            <span class="op-structure__tag">基调</span>{{ reading.bias }}
          </p>
          <p v-if="reading.zones" class="op-structure__line">
            <span class="op-structure__tag">走廊</span>{{ reading.zones }}
          </p>
          <p v-for="(item, index) in reading.watch" :key="index" class="op-structure__line">
            <span class="op-structure__tag">注意</span>{{ item }}
          </p>
          <p class="op-note">按救急、冲突、到期、口径矛盾四项排序。结构观察，不是买卖信号。</p>
        </div>
      </section>
    </template>
  </section>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { describeOptionStructure } from '../impl/option-structure.js'
  import { describeVolatilityStats } from '../impl/option-summary.js'
  import type { OptionPanelState } from '../impl/use-option-panel.js'

  const props = defineProps<{
    /** 面板状态；由宿主创建，AI 快捷提示复用同一份数据 */
    state: OptionPanelState
  }>()

  /** 数据滞后阈值：超过它就把时间标黄。 */
  const STALE_MS = 10 * 60 * 1000

  const view = computed(() => props.state.view.value)
  const loading = computed(() => props.state.loading.value)
  const error = computed(() => props.state.error.value)
  const refresh = () => props.state.refresh()

  /** 场所的展示名。行里存的是枚举值（deribit / binance），界面要给人读的写法。 */
  const VENUE_LABELS: Readonly<Record<string, string>> = {
    deribit: 'Deribit',
    binance: 'Binance',
  }

  /**
   * 标题：标的 + 期权 + 数据场所，让「BTC」和图表上的 BTCUSDT.P 区分开，
   * 也让 Deribit 与 Binance 的数据不被当成同一个来源。
   */
  const title = computed(() => {
    if (view.value === null) return '期权'
    const raw = view.value.venue
    if (raw === null) return `${view.value.currency} 期权`
    return `${view.value.currency} 期权 · ${VENUE_LABELS[raw] ?? raw}`
  })

  const staleClass = computed(() => {
    const updated = props.state.lastUpdated.value
    if (updated === null) return ''
    return Date.now() - updated > STALE_MS ? 'op-stale--warn' : ''
  })

  const freshnessText = computed(() => {
    const updated = props.state.lastUpdated.value
    if (updated === null) return '未连接'
    const seconds = Math.round((Date.now() - updated) / 1000)
    if (seconds < 60) return `${seconds} 秒前更新`
    return `${Math.round(seconds / 60)} 分钟前更新`
  })

  /** 指示灯：报错红、数据陈旧黄、正常绿、未取到灰。 */
  const statusTone = computed(() => {
    if (error.value !== null) return 'error'
    const updated = props.state.lastUpdated.value
    if (updated === null) return 'offline'
    return Date.now() - updated > STALE_MS ? 'warning' : 'online'
  })

  const statusLabel = computed(() => {
    if (error.value !== null) return '期权服务报错'
    if (props.state.lastUpdated.value === null) return '尚未取到数据'
    return statusTone.value === 'warning' ? '数据超过 10 分钟未更新' : '在线'
  })

  const reading = computed(() => (view.value === null ? null : describeOptionStructure(view.value)))

  /** 长窗口分位一行；统计不可用时说明缺口，不留空白。 */
  const volatilityLine = computed(() => describeVolatilityStats(view.value?.volatility ?? null))

  /**
   * 价格文本。
   *
   * @param value 价格；null 显示破折号
   * @returns 千分位文本
   */
  function priceText(value: number | null): string {
    return value === null ? '—' : value.toLocaleString('en-US', { maximumFractionDigits: 2 })
  }

  /**
   * 距现价的百分比距离文本。
   *
   * @param target 目标价；null 显示破折号
   * @returns 位置文本
   */
  function gapText(target: number | null): string {
    const spot = view.value?.spotIndex ?? null
    if (target === null || spot === null || !(spot > 0)) return '—'
    const percent = ((target - spot) / spot) * 100
    return `${percent >= 0 ? '上方' : '下方'} ${Math.abs(percent).toFixed(2)}%`
  }

  /**
   * 百分比文本。
   *
   * @param value 百分数；null 显示破折号
   * @returns 一位小数
   */
  function percentText(value: number | null): string {
    return value === null ? '—' : `${value.toFixed(1)}%`
  }

  /**
   * 剩余天数文本。
   *
   * @param value 天数；null 显示破折号
   * @returns 两位小数
   */
  function dteText(value: number | null): string {
    return value === null ? '—' : `${value.toFixed(2)} 天`
  }

  /**
   * 区间文本。
   *
   * @param lower 下沿
   * @param upper 上沿
   * @returns 区间或破折号
   */
  function rangeText(lower: number | null, upper: number | null): string {
    if (lower === null || upper === null) return '—'
    return `${priceText(lower)}–${priceText(upper)}`
  }

  /**
   * 净 GEX 文本：百万级用 M，千级用 K。
   *
   * @param value USD/1%；null 显示破折号
   * @returns 简短文本
   */
  function gexText(value: number | null): string {
    if (value === null) return '—'
    const sign = value >= 0 ? '+' : '−'
    const magnitude = Math.abs(value)
    if (magnitude >= 1e6) return `${sign}${(magnitude / 1e6).toFixed(2)}M`
    if (magnitude >= 1e3) return `${sign}${(magnitude / 1e3).toFixed(1)}K`
    return `${sign}${magnitude.toFixed(0)}`
  }

  /**
   * 多空比文本。
   *
   * @param value 比值；null 显示破折号
   * @returns 两位小数
   */
  function ratioText(value: number | null): string {
    return value === null ? '—' : value.toFixed(2)
  }

  /**
   * 持仓量文本。
   *
   * @param value 张数；null 显示破折号
   * @returns 千分位整数
   */
  function openInterestText(value: number | null): string {
    return value === null ? '—' : value.toLocaleString('en-US', { maximumFractionDigits: 0 })
  }

  /**
   * 正负号对应的样式类。
   *
   * @param value 数值
   * @returns 样式类
   */
  function signClass(value: number | null): string {
    if (value === null) return ''
    return value >= 0 ? 'op-up' : 'op-down'
  }
</script>

<style scoped>
  .option-panel {
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

  .op-header {
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

  .op-header__title {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }

  .op-symbol {
    font-weight: 600;
    font-size: 13px;
  }

  .op-stale {
    font-size: 11px;
    opacity: 0.6;
  }

  .op-stale--warn {
    color: var(--klc-color-candle-up-body);
    opacity: 1;
  }

  .op-header__actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .op-refresh {
    flex: none;
    padding: 3px 10px;
    font-size: 11px;
    color: var(--klc-color-ui-text);
    background: var(--klc-color-ui-surface);
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 4px;
    cursor: pointer;
  }

  .op-refresh:hover:not(:disabled) {
    background: var(--klc-color-ui-hover);
  }

  .op-refresh:disabled {
    cursor: default;
    opacity: 0.6;
  }

  .op-status {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--klc-color-ui-neutral);
    flex: none;
  }

  .op-status--online {
    background: var(--klc-color-ui-success);
    box-shadow: 0 0 6px var(--klc-color-ui-success);
  }

  .op-status--warning {
    background: var(--klc-color-ui-warning);
    box-shadow: 0 0 6px var(--klc-color-ui-warning);
  }

  .op-status--offline {
    background: var(--klc-color-ui-neutral);
  }

  .op-status--error {
    background: var(--klc-color-ui-danger);
    box-shadow: 0 0 6px var(--klc-color-ui-danger);
  }

  .op-error {
    margin: 0;
    padding: 8px 10px;
    color: var(--klc-color-ui-danger);
    border: 1px solid var(--klc-color-ui-danger);
    border-radius: 6px;
  }

  .op-hint {
    margin: 0;
    opacity: 0.7;
  }

  .op-card {
    padding: 10px;
    background: var(--klc-color-ui-surface);
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 6px;
  }

  .op-card__title {
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 600;
  }

  .op-kv {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 12px;
    margin: 0;
  }

  .op-kv dt {
    opacity: 0.7;
  }

  .op-kv dd {
    margin: 0;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .op-table {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }

  .op-table th {
    padding: 2px 0;
    font-weight: 500;
    text-align: right;
    opacity: 0.6;
  }

  .op-table th:first-child,
  .op-table td:first-child {
    text-align: left;
  }

  .op-table td {
    padding: 3px 0;
    text-align: right;
    border-top: 1px solid var(--klc-color-ui-border);
  }

  /* Call 墙用上涨色、Put 墙用下跌色，与主图指标的配色语义保持一致。 */
  .op-wall--call {
    color: var(--klc-color-candle-up-body);
  }

  .op-wall--put {
    color: var(--klc-color-candle-down-body);
  }

  .op-up {
    color: var(--klc-color-ui-success);
  }

  .op-down {
    color: var(--klc-color-ui-danger);
  }

  .op-note {
    margin: 8px 0 0;
    font-size: 11px;
    line-height: 1.5;
    opacity: 0.6;
  }

  /* 长窗口分位：一行文字，数字用等宽，扫读时不跳动。 */
  .op-stats {
    margin: 8px 0 0;
    padding-top: 6px;
    border-top: 1px dashed var(--klc-color-ui-border);
    font-size: 11px;
    line-height: 1.6;
    font-variant-numeric: tabular-nums;
    opacity: 0.8;
  }

  .op-structure {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .op-structure__line {
    margin: 0;
    line-height: 1.7;
  }

  /* 行首标签固定在 34px，三行文字左边界对齐，扫读时不会跳。 */
  .op-structure__tag {
    display: inline-block;
    min-width: 34px;
    margin-right: 6px;
    padding: 0 4px;
    border-radius: 3px;
    background: var(--klc-color-ui-surface-raised);
    font-size: 11px;
    opacity: 0.7;
  }
</style>
