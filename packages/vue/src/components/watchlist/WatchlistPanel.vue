<!-- TopBar 自选股入口：按数据源或品种类型分组呈现列表，并保留行内移除。 -->
<template>
  <DropMenu
    :label="menuLabel"
    class="watchlist-menu"
    :groups="groups"
    trigger-class="watchlist-trigger"
    tooltip-placement="bottom"
    placement="bottom"
    empty-text="暂无自选股"
    density="compact"
    @select="onSelect"
  >
    <template #trigger><IconBookmark aria-hidden="true" /></template>
    <template #header>
      <BaseTabs
        :model-value="grouping"
        :tabs="GROUPING_TABS"
        size="compact"
        aria-label="自选分组方式"
        @update:model-value="onGroupingChange"
      />
    </template>
    <template #item="{ item, select }">
      <button type="button" role="menuitem" class="drop-menu__item-main" @click="select">
        <span class="watchlist-item">
          <span class="watchlist-item__identity">
            <span class="watchlist-item__symbol">{{ byId.get(item.id)?.symbol }}</span>
            <span v-if="byId.get(item.id)?.name" class="watchlist-item__name">
              {{ byId.get(item.id)?.name }}
            </span>
          </span>
          <span class="watchlist-item__quote" :class="directionClass(item.id)">
            <span class="watchlist-item__price">{{ priceText(item.id) }}</span>
            <span class="watchlist-item__change">{{ changeText(item.id) }}</span>
          </span>
        </span>
      </button>
    </template>
    <template #item-action="{ item }">
      <button type="button" :aria-label="`移除自选 ${item.label}`" @click.stop="onRemove(item.id)">
        <IconX aria-hidden="true" />
      </button>
    </template>
  </DropMenu>
</template>

<script setup lang="ts">
  import BaseTabs from '@vue-src/components/common/BaseTabs.vue'
  import DropMenu, { type DropMenuGroup } from '@vue-src/components/common/DropMenu.vue'
  import { useMarketDataSourceCatalog } from '@vue-src/composables/market/useMarketDataSourceCatalog.js'
  import {
    type SearchableSymbol,
    symbolIdentityKey,
  } from '@vue-src/composables/symbol/useSymbolSearch.js'
  import type { WatchlistGrouping } from '@vue-src/composables/watchlist/useWatchlist.js'
  import { useWatchlistGroups } from '@vue-src/composables/watchlist/useWatchlistGroups.js'
  import { useWatchlistQuotes, type WatchlistQuote } from '@vue-src/composables/watchlist/useWatchlistQuotes.js'
  import {
    formatQuoteChange,
    formatQuotePrice,
    QUOTE_PLACEHOLDER,
    quoteDirection,
  } from '@vue-src/composables/watchlist/watchlistQuoteFormat.js'
  import { computed } from 'vue'
  import IconBookmark from '~icons/tabler/bookmark'
  import IconX from '~icons/tabler/x'

  /** 分组切换项；顺序即界面展示顺序。 */
  const GROUPING_TABS: ReadonlyArray<{ id: WatchlistGrouping; label: string }> = [
    { id: 'source', label: '数据源' },
    { id: 'instrumentType', label: '品种类型' },
  ]

  const props = defineProps<{
    items: ReadonlyArray<SearchableSymbol>
    grouping: WatchlistGrouping
  }>()
  const emit = defineEmits<{
    select: [item: SearchableSymbol]
    remove: [item: SearchableSymbol]
    'update:grouping': [grouping: WatchlistGrouping]
  }>()

  /** id → 品种，供 item 插槽还原符号、名称与交易所。 */
  const byId = computed(() => new Map(props.items.map((item) => [symbolIdentityKey(item), item])))

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

  const { quotes, sourceStatus } = useWatchlistQuotes(() => props.items)

  /** 该行可用的报价：来源必须在线，断线时整行回到占位而不是展示旧值。 */
  function quoteOf(id: string): WatchlistQuote | null {
    const item = byId.value.get(id)
    if (!item || sourceStatus.value.get(item.sourceId) !== 'connected') return null
    return quotes.value.get(symbolIdentityKey(item)) ?? null
  }

  function priceText(id: string): string {
    const item = byId.value.get(id)
    const quote = quoteOf(id)
    return item && quote ? formatQuotePrice(quote, item.tickSize) : QUOTE_PLACEHOLDER
  }

  function changeText(id: string): string {
    const quote = quoteOf(id)
    return quote ? formatQuoteChange(quote) : QUOTE_PLACEHOLDER
  }

  /** 涨跌色走主题的 positive / negative 语义 Token，红涨绿跌由配色预设决定。 */
  function directionClass(id: string): string {
    const quote = quoteOf(id)
    return quote ? `is-${quoteDirection(quote)}` : 'is-unavailable'
  }

  /** 触发按钮同时承担可发现性：标题里带当前自选数量。 */
  const menuLabel = computed(() =>
    props.items.length > 0 ? `自选股（${props.items.length}）` : '自选股',
  )

  const groups = computed<ReadonlyArray<DropMenuGroup>>(() => {
    if (groupedItems.value.length === 0) return [{ id: 'empty', label: '', items: [] }]
    return groupedItems.value.map((group) => ({
      id: group.key,
      label: `${group.label}（${group.items.length}）`,
      items: group.items.map((item) => ({ id: symbolIdentityKey(item), label: item.symbol })),
    }))
  })

  /** 切换分组维度；状态与持久化由图层统一持有。 */
  function onGroupingChange(grouping: WatchlistGrouping): void {
    emit('update:grouping', grouping)
  }

  /** 选中项：DropMenu 已负责关闭面板，这里只回传领域对象。 */
  function onSelect(_group: string, id: string): void {
    const item = byId.value.get(id)
    if (item) emit('select', item)
  }

  /** 移除自选：不关闭面板，列表随 props 更新。 */
  function onRemove(id: string): void {
    const item = byId.value.get(id)
    if (item) emit('remove', item)
  }
</script>

<style scoped>
  /* 商品行上下留白与搜索列表一致，覆盖紧凑菜单默认的 4px。 */
  .drop-menu__item-main {
    --drop-menu-item-padding-block: 10px;
  }

  /* 业务外观覆盖共享按钮默认值；必须带面板容器类，才能压过同为单类规则的 control-button。 */
  .watchlist-menu :deep(.watchlist-trigger) {
    width: 30px;
    min-width: 30px;
    height: 30px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--klc-color-ui-muted);
  }

  .watchlist-menu :deep(.watchlist-trigger:hover:not(:disabled)),
  .watchlist-menu :deep(.watchlist-trigger[aria-expanded='true']:not(:disabled)) {
    background: var(--klc-color-ui-hover);
  }

  .watchlist-menu :deep(.watchlist-trigger svg) {
    width: 18px;
    height: 18px;
  }

  .watchlist-item {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 16px;
    width: 100%;
    min-width: 0;
  }

  /* 与商品搜索、比较商品的代码/名称两行块保持一致：gap 与 line-height 对齐，避免间距被 DropMenu 的 20px 行高放大。 */
  .watchlist-item__identity {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    gap: 3px;
    min-width: 0;
    max-width: 100%;
    overflow-wrap: anywhere;
  }

  .watchlist-item__symbol {
    font-size: 13px;
    font-weight: 600;
    line-height: 1.2;
  }

  .watchlist-item__name {
    color: var(--klc-color-ui-muted);
    font-size: 11px;
    line-height: 1.2;
  }

  .watchlist-item__quote {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 3px;
    flex: 0 0 auto;
    min-width: 84px;
    font-family: var(--klc-typography-font-family-mono);
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
  }

  .watchlist-item__price {
    font-size: 13px;
    font-weight: 600;
  }

  .watchlist-item__change {
    font-size: 11px;
  }

  /* 涨跌色只消费主题语义 Token；红涨绿跌由配色预设切换。 */
  .watchlist-item__quote.is-up {
    color: var(--klc-color-performance-positive);
  }

  .watchlist-item__quote.is-down {
    color: var(--klc-color-performance-negative);
  }

  .watchlist-item__quote.is-flat {
    color: var(--klc-color-performance-neutral);
  }

  .watchlist-item__quote.is-unavailable {
    color: var(--klc-color-ui-muted);
  }
</style>
