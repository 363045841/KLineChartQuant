<!-- 商品元信息徽标：交易所 · 品种类别 · 会话；商品搜索、比较商品与自选股共用同一格式与样式。 -->
<template>
  <span v-if="text" class="symbol-meta-badge">{{ text }}</span>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import type { SearchableSymbol } from '../../composables/useSymbolSearch.js'

  const props = defineProps<{ symbol?: SearchableSymbol }>()

  /** 交易所 + 品种类别 + 会话，便于区分同代码多语义。 */
  const text = computed(() => {
    const symbol = props.symbol
    if (!symbol) return ''
    const parts = [symbol.exchange]
    if (symbol.assetClass !== 'unknown') parts.push(symbol.assetClass)
    if (symbol.sessionId) parts.push(symbol.sessionId)
    return parts.join(' · ')
  })
</script>

<style scoped>
  .symbol-meta-badge {
    flex: 0 0 auto;
    box-sizing: border-box;
    max-width: 100%;
    padding: 3px 8px;
    border-radius: 6px;
    background: var(--klc-color-ui-control-background);
    color: var(--klc-color-ui-muted);
    font-family: var(--klc-typography-font-family-mono);
    font-size: 11px;
    font-weight: 400;
    line-height: 1.4;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    overflow-wrap: anywhere;
  }
</style>
