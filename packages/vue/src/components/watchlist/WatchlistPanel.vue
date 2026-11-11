<!-- TopBar 自选股入口：按数据源或品种类型分组，组可折叠，行内展示最新价、涨跌额与涨跌幅。 -->
<template>
  <div class="watchlist">
    <BaseTooltip :content="menuLabel" placement="bottom" :disabled="open">
      <button
        ref="trigger"
        type="button"
        class="control-button watchlist__trigger"
        v-bind="popover.triggerBindings.value"
        :aria-label="menuLabel"
        aria-haspopup="dialog"
        @click="popover.onTriggerClick"
      >
        <IconBookmark aria-hidden="true" />
      </button>
    </BaseTooltip>
    <Teleport :to="teleportTarget">
      <div
        ref="panel"
        class="watchlist-panel popover-surface popover-surface--scroll"
        v-bind="popover.panelBindings.value"
        role="dialog"
        :aria-label="menuLabel"
      >
        <template v-if="open">
          <div class="watchlist-panel__head">
            <BaseTabs
              :model-value="grouping"
              :tabs="GROUPING_TABS"
              aria-label="自选分组方式"
              @update:model-value="onGroupingChange"
            />
            <div v-if="groups.length > 0" class="watchlist-panel__columns" aria-hidden="true">
              <span class="watchlist-panel__columns-spacer" />
              <span>最新价</span>
              <span>涨跌</span>
              <span>涨跌幅</span>
            </div>
          </div>
          <div v-if="groups.length === 0" class="watchlist-panel__empty">暂无自选股</div>
          <div
            v-if="quoteIssues.length > 0 && !issuesDismissed"
            class="watchlist-panel__issues"
            role="status"
          >
            <p v-for="issue in quoteIssues" :key="issue.sourceId" class="watchlist-panel__issue">
              <span class="watchlist-panel__issue-source">{{ issue.label }}</span>
              <span class="watchlist-panel__issue-message" :title="issue.message">
                {{ issue.message }}
              </span>
            </p>
            <button
              type="button"
              class="watchlist-panel__issue-close"
              aria-label="关闭行情提示"
              @click="issuesDismissed = true"
            >
              <IconX aria-hidden="true" />
            </button>
          </div>
          <section v-for="group in groups" :key="group.key" class="watchlist-group">
            <button
              type="button"
              class="watchlist-group__header"
              :aria-expanded="!group.collapsed"
              @click="toggleGroup(group.key)"
            >
              <IconChevronDown
                class="watchlist-group__chevron"
                :class="{ 'is-collapsed': group.collapsed }"
                aria-hidden="true"
              />
              <span class="watchlist-group__label">{{ group.label }}</span>
            </button>
            <ul v-if="!group.collapsed" class="watchlist-group__list">
              <li v-for="row in group.rows" :key="row.key" class="watchlist-row">
                <button type="button" class="watchlist-row__select" @click="onSelect(row.item)">
                  <ColorAvatar :color="row.avatarColor">
                    {{ row.initial }}
                  </ColorAvatar>
                  <span class="watchlist-row__symbol">{{ row.item.symbol }}</span>
                  <span class="watchlist-row__price" :class="`is-${row.tone}`">{{ row.price }}</span>
                  <span class="watchlist-row__change" :class="`is-${row.tone}`">{{ row.change }}</span>
                  <span class="watchlist-row__percent" :class="`is-${row.percentTone}`">{{ row.percent }}</span>
                </button>
                <button
                  type="button"
                  class="watchlist-row__remove"
                  :aria-label="`移除自选 ${row.item.symbol}`"
                  @click.stop="onRemove(row.item)"
                >
                  <IconX aria-hidden="true" />
                </button>
              </li>
            </ul>
          </section>
        </template>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
  import '../common/control-button.css'
  import '../common/popover-surface.css'

  import BaseTabs from '@vue-src/components/common/BaseTabs.vue'
  import BaseTooltip from '@vue-src/components/common/BaseTooltip.vue'
  import ColorAvatar from '@vue-src/components/common/ColorAvatar.vue'
  import { useMarketDataSourceCatalog } from '@vue-src/composables/market/useMarketDataSourceCatalog.js'
  import { useAnchoredPopover } from '@vue-src/composables/overlay/useAnchoredPopover.js'
  import {
    type SearchableSymbol,
    symbolIdentityKey,
  } from '@vue-src/composables/symbol/useSymbolSearch.js'
  import { useFullscreenTeleportTarget } from '@vue-src/composables/ui/useFullscreenTeleportTarget.js'
  import type { WatchlistGrouping } from '@vue-src/composables/watchlist/useWatchlist.js'
  import { useWatchlistGroups } from '@vue-src/composables/watchlist/useWatchlistGroups.js'
  import { useWatchlistQuotes } from '@vue-src/composables/watchlist/useWatchlistQuotes.js'
  import {
    symbolInitial,
    symbolPaletteIndex,
  } from '@vue-src/composables/watchlist/watchlistAvatar.js'
  import type {
    QuoteDirection,
    WatchlistQuote,
  } from '@vue-src/composables/watchlist/watchlistQuote.js'
  import {
    formatQuoteChange,
    formatQuotePercent,
    formatQuotePrice,
    percentDirection,
    QUOTE_PLACEHOLDER,
  } from '@vue-src/composables/watchlist/watchlistQuoteFormat.js'
  import { computed, ref, useTemplateRef, watch } from 'vue'
  import IconBookmark from '~icons/tabler/bookmark'
  import IconChevronDown from '~icons/tabler/chevron-down'
  import IconX from '~icons/tabler/x'

  /** 分组切换项；品种在前，数据源在后。 */
  const GROUPING_TABS: ReadonlyArray<{ id: WatchlistGrouping; label: string }> = [
    { id: 'instrumentType', label: '品种' },
    { id: 'source', label: '数据源' },
  ]

  /** 报价色调：无可用报价单列一档，展示为占位灰。 */
  type QuoteTone = QuoteDirection | 'unavailable'

  /** 行情提示条目：来源展示名 + 失败原因。 */
  interface QuoteIssue {
    sourceId: string
    label: string
    message: string
  }

  /** 行视图模型：报价、方向与图标在投影阶段一次算好，模板不再重复查表。 */
  interface WatchlistRow {
    key: string
    item: SearchableSymbol
    initial: string
    avatarColor: string
    price: string
    change: string
    percent: string
    /** 最新价与涨跌额的色调：跟随逐笔价格方向。 */
    tone: QuoteTone
    /** 涨跌幅的色调：按涨跌幅自身正负判定。 */
    percentTone: QuoteTone
  }

  const props = defineProps<{
    items: ReadonlyArray<SearchableSymbol>
    grouping: WatchlistGrouping
  }>()
  const emit = defineEmits<{
    select: [item: SearchableSymbol]
    remove: [item: SearchableSymbol]
    'update:grouping': [grouping: WatchlistGrouping]
  }>()

  const trigger = useTemplateRef<HTMLElement>('trigger')
  const panel = useTemplateRef<HTMLElement>('panel')
  const teleportTarget = useFullscreenTeleportTarget()
  const popover = useAnchoredPopover({
    trigger,
    panel,
    placement: 'bottom',
    offset: 4,
    maxHeight: () => 'min(460px, calc(100vh - 24px))',
  })
  const open = popover.open

  /** 数据源显示名；键顺序即数据源分组顺序。 */
  const catalog = useMarketDataSourceCatalog()
  const sourceLabels = computed(
    () => new Map(catalog.value.map((source) => [source.name, source.displayName])),
  )

  const groupedItems = useWatchlistGroups(
    () => props.items,
    () => props.grouping,
    sourceLabels,
  )

  const { quotes, sourceStatus, sourceErrors } = useWatchlistQuotes(() => props.items)

  /** 该行可用的报价：来源必须在线，断线时整行回到占位而不是展示旧值。 */
  function quoteOf(item: SearchableSymbol): WatchlistQuote | null {
    if (sourceStatus.value.get(item.sourceId) !== 'connected') return null
    return quotes.value.get(symbolIdentityKey(item)) ?? null
  }

  /** 涨跌幅色调：按涨跌幅自身正负判定；没有昨收基准时与占位符一起回到灰色。 */
  function percentToneOf(quote: WatchlistQuote | null): QuoteTone {
    if (!quote || quote.prevClose <= 0) return 'unavailable'
    return percentDirection(quote)
  }

  /** 报价与标识一次投影；标识颜色只依赖代码，跨会话与分组稳定。 */
  function toRow(item: SearchableSymbol): WatchlistRow {
    const quote = quoteOf(item)
    return {
      key: symbolIdentityKey(item),
      item,
      initial: symbolInitial(item.symbol),
      avatarColor: `var(--klc-color-palette-i${symbolPaletteIndex(item.symbol)})`,
      price: quote ? formatQuotePrice(quote, item.tickSize) : QUOTE_PLACEHOLDER,
      change: quote ? formatQuoteChange(quote, item.tickSize) : QUOTE_PLACEHOLDER,
      percent: quote ? formatQuotePercent(quote) : QUOTE_PLACEHOLDER,
      tone: quote ? quote.direction : 'unavailable',
      percentTone: percentToneOf(quote),
    }
  }

  /** 报价不可用的来源：断线或订阅报错必须显式说明，不能和“没有数据”共用同一个占位。 */
  const quoteIssues = computed(() => {
    const issues: QuoteIssue[] = []
    const seen = new Set<string>()
    for (const item of props.items) {
      if (seen.has(item.sourceId)) continue
      const error = sourceErrors.value.get(item.sourceId)
      const status = sourceStatus.value.get(item.sourceId)
      if (error === undefined && status !== 'disconnected') continue
      seen.add(item.sourceId)
      issues.push({
        sourceId: item.sourceId,
        label: sourceLabels.value.get(item.sourceId) ?? item.sourceId,
        message: error ?? '行情连接失败',
      })
    }
    return issues
  })

  /** 整框关闭；故障消失后复位，下一次失败仍会提示。 */
  const issuesDismissed = ref(false)
  watch(quoteIssues, (issues) => {
    if (issues.length === 0) issuesDismissed.value = false
  })

  /** 折叠状态按“分组维度 + 分组键”记录，切换维度不会互相影响。 */
  const collapsedGroups = ref<ReadonlySet<string>>(new Set())

  function groupStateKey(key: string): string {
    return `${props.grouping}:${key}`
  }

  const groups = computed(() =>
    groupedItems.value.map((group) => ({
      key: group.key,
      label: group.label,
      collapsed: collapsedGroups.value.has(groupStateKey(group.key)),
      rows: group.items.map(toRow),
    })),
  )

  /** 折叠/展开单个分组；替换整份集合以触发一次响应式更新。 */
  function toggleGroup(key: string): void {
    const stateKey = groupStateKey(key)
    const next = new Set(collapsedGroups.value)
    if (next.has(stateKey)) next.delete(stateKey)
    else next.add(stateKey)
    collapsedGroups.value = next
  }

  /** 触发按钮同时承担可发现性：标题里带当前自选数量。 */
  const menuLabel = computed(() =>
    props.items.length > 0 ? `自选股（${props.items.length}）` : '自选股',
  )

  /** 切换分组维度；状态与持久化由图层统一持有。 */
  function onGroupingChange(grouping: WatchlistGrouping): void {
    emit('update:grouping', grouping)
  }

  /** 选中品种：切图后关闭面板，焦点回到触发按钮。 */
  function onSelect(item: SearchableSymbol): void {
    popover.hide({ restoreFocus: true })
    emit('select', item)
  }

  /** 移除自选：面板保持打开，列表随 props 更新。 */
  function onRemove(item: SearchableSymbol): void {
    emit('remove', item)
  }
</script>


<style scoped>
  .watchlist {
    flex: 0 0 auto;
  }

  /* 触发器只保留图标，外观与工具栏其它入口一致。 */
  .watchlist__trigger {
    width: 30px;
    min-width: 30px;
    height: 30px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--klc-color-ui-muted);
  }

  .watchlist__trigger:hover:not(:disabled),
  .watchlist__trigger[aria-expanded='true']:not(:disabled) {
    background: var(--klc-color-ui-hover);
    color: var(--klc-color-ui-text);
  }

  .watchlist__trigger svg {
    width: 18px;
    height: 18px;
  }

  /* 五列网格：图标、代码、最新价、涨跌额、涨跌幅；列标题与行共用同一模板。 */
  .watchlist-panel {
    --watchlist-grid: 22px minmax(0, 1fr) 88px 78px 70px;
    box-sizing: border-box;
    width: min(440px, calc(100vw - 16px));
    max-height: min(460px, calc(100vh - 24px));
    /* 面板只做纵向滚动；横向溢出一律裁掉，避免出现左右滚动条。 */
    overflow-x: hidden;
  }

  /* 分组切换与列标题随滚动固定在顶部，长列表滚动时列语义不丢。 */
  .watchlist-panel__head {
    position: sticky;
    top: 0;
    z-index: 1;
    padding-top: 4px;
    background: var(--klc-color-ui-input);
  }

  .watchlist-panel__columns {
    display: grid;
    grid-template-columns: var(--watchlist-grid);
    gap: 0 8px;
    padding: 6px 30px 4px 12px;
    color: var(--klc-color-ui-muted);
    font-size: 11px;
    line-height: 14px;
  }

  .watchlist-panel__columns span {
    text-align: right;
  }

  .watchlist-panel__columns-spacer {
    grid-column: span 2;
  }

  .watchlist-panel__empty {
    padding: 16px 12px;
    color: var(--klc-color-ui-muted);
    font-size: 12px;
  }

  .watchlist-group + .watchlist-group {
    margin-top: 2px;
  }

  /* 报价失败必须可见：与“暂无报价”的占位灰区分开。 */
  .watchlist-panel__issues {
    position: relative;
    margin: 0;
    padding: 6px 28px 6px 12px;
    background: var(--klc-color-ui-warning-background);
    color: var(--klc-color-ui-warning-text);
    font-size: 11px;
    line-height: 16px;
  }

  .watchlist-panel__issue {
    display: flex;
    gap: 6px;
    min-width: 0;
    margin: 0;
  }

  .watchlist-panel__issue-source {
    flex: 0 0 auto;
    font-weight: 600;
  }

  .watchlist-panel__issue-message {
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* 关闭按钮只收起提示，垂直居中于整框，hover 只高亮图标本身。 */
  .watchlist-panel__issue-close {
    position: absolute;
    top: 50%;
    right: 8px;
    transform: translateY(-50%);
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    opacity: 0.7;
    cursor: pointer;
  }

  .watchlist-panel__issue-close:hover,
  .watchlist-panel__issue-close:focus-visible {
    opacity: 1;
    outline: 0;
  }

  .watchlist-panel__issue-close svg {
    width: 12px;
    height: 12px;
  }

  .watchlist-group__header {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    box-sizing: border-box;
    padding: 6px 12px;
    border: 0;
    background: transparent;
    color: var(--klc-color-ui-muted);
    font: inherit;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    line-height: 16px;
    text-align: left;
    text-transform: uppercase;
    cursor: pointer;
  }

  .watchlist-group__header:hover,
  .watchlist-group__header:focus-visible {
    color: var(--klc-color-ui-text);
    outline: 0;
  }

  .watchlist-group__chevron {
    width: 14px;
    height: 14px;
    flex: 0 0 auto;
    transition: transform var(--klc-motion-dur-fast) var(--klc-motion-ease-standard);
  }

  .watchlist-group__chevron.is-collapsed {
    transform: rotate(-90deg);
  }

  .watchlist-group__list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .watchlist-row {
    position: relative;
  }

  /* 右侧留出移除按钮的空间，数字列不因悬停出现操作区而位移。 */
  .watchlist-row__select {
    display: grid;
    grid-template-columns: var(--watchlist-grid);
    align-items: center;
    gap: 0 8px;
    width: 100%;
    box-sizing: border-box;
    padding: 7px 30px 7px 12px;
    border: 0;
    background: transparent;
    color: var(--klc-color-ui-text);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    line-height: 16px;
    text-align: left;
    cursor: pointer;
  }

  .watchlist-row__select:hover,
  .watchlist-row__select:focus-visible {
    background: var(--klc-color-ui-hover);
    outline: 0;
  }

  .watchlist-row__symbol {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .watchlist-row__price,
  .watchlist-row__change,
  .watchlist-row__percent {
    overflow: hidden;
    color: var(--watchlist-quote-color);
    font-family: var(--klc-typography-font-family-mono);
    font-variant-numeric: tabular-nums;
    text-align: right;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* 涨跌色只消费主题语义 Token；红涨绿跌由配色预设切换，色调落在单元格上。 */
  .watchlist-row .is-up {
    --watchlist-quote-color: var(--klc-color-performance-positive);
  }

  .watchlist-row .is-down {
    --watchlist-quote-color: var(--klc-color-performance-negative);
  }

  .watchlist-row .is-flat {
    --watchlist-quote-color: var(--klc-color-performance-neutral);
  }

  .watchlist-row .is-unavailable {
    --watchlist-quote-color: var(--klc-color-ui-muted);
  }

  /* 关闭按钮与行文字同一条水平中线；悬停只改图标颜色，不额外铺底板。 */
  .watchlist-row__remove {
    position: absolute;
    top: 50%;
    right: 6px;
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--klc-color-ui-muted);
    transform: translateY(-50%);
    visibility: hidden;
    cursor: pointer;
  }

  .watchlist-row:hover .watchlist-row__remove,
  .watchlist-row:focus-within .watchlist-row__remove {
    visibility: visible;
  }

  .watchlist-row__remove:hover,
  .watchlist-row__remove:focus-visible {
    color: var(--klc-color-ui-danger-text);
    outline: 0;
  }

  .watchlist-row__remove svg {
    width: 14px;
    height: 14px;
  }

  @media (max-width: 480px) {
    .watchlist-panel {
      --watchlist-grid: 20px minmax(0, 1fr) 76px 68px 64px;
    }
  }
</style>
