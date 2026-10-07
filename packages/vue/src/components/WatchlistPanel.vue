<!-- TopBar 自选股入口：复用 DropMenu 呈现列表与行内移除。 -->
<template>
  <DropMenu
    label="自选股"
    :groups="groups"
    trigger-class="watchlist-trigger"
    tooltip-placement="bottom"
    placement="bottom"
    empty-text="暂无自选股"
    density="compact"
    replace-detail-on-action
    @select="onSelect"
  >
    <template #trigger><IconBookmark aria-hidden="true" /></template>
    <template #item="{ item, select }">
      <button type="button" role="menuitem" class="drop-menu__item-main" @click="select">
        <span class="watchlist-item">
          <span class="watchlist-item__identity">
            <span class="watchlist-item__symbol">{{ byId.get(item.id)?.symbol }}</span>
            <span v-if="byId.get(item.id)?.name" class="watchlist-item__name">
              {{ byId.get(item.id)?.name }}
            </span>
          </span>
          <span class="watchlist-item__meta drop-menu__item-detail">
            <SymbolMetaBadge :symbol="byId.get(item.id)" />
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
  import { computed } from 'vue'
  import IconBookmark from '~icons/tabler/bookmark'
  import IconX from '~icons/tabler/x'
  import { type SearchableSymbol, symbolIdentityKey } from '../composables/useSymbolSearch.js'
  import SymbolMetaBadge from './common/SymbolMetaBadge.vue'
  import DropMenu, { type DropMenuGroup } from './DropMenu.vue'

  const props = defineProps<{ items: ReadonlyArray<SearchableSymbol>; activeKey?: string }>()
  const emit = defineEmits<{
    select: [item: SearchableSymbol]
    remove: [item: SearchableSymbol]
  }>()

  /** id → 品种，供 item 插槽还原符号、名称与交易所。 */
  const byId = computed(() => new Map(props.items.map((item) => [symbolIdentityKey(item), item])))
  const groups = computed<ReadonlyArray<DropMenuGroup>>(() => [
    {
      id: 'watchlist',
      label: props.items.length > 0 ? `自选股（${props.items.length}）` : '自选股',
      items: props.items.map((item) => ({
        id: symbolIdentityKey(item),
        label: item.symbol,
        active: symbolIdentityKey(item) === props.activeKey,
      })),
    },
  ])

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

  /* DropMenu 触发器是共享组件的元素，用 :deep 收紧为紧凑图标按钮。 */
  :deep(.watchlist-trigger) {
    width: 30px;
    min-width: 30px;
    height: 30px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--klc-color-ui-muted);
  }

  :deep(.watchlist-trigger:hover:not(:disabled)),
  :deep(.watchlist-trigger[aria-expanded='true']:not(:disabled)) {
    background: var(--klc-color-ui-hover);
  }

  :deep(.watchlist-trigger svg) {
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

  /* 空间不足时整块换行，不挤压或覆盖商品信息。 */
  .watchlist-item__meta {
    display: flex;
    flex: 0 0 auto;
    max-width: 100%;
  }
</style>
