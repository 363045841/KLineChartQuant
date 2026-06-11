<template>
  <div ref="chipWrapRef" class="symbol-chip-wrap">
    <button
      type="button"
      class="symbol-chip"
      :class="{ 'is-open': showPopup }"
      :title="symbol"
      :aria-expanded="showPopup"
      aria-haspopup="dialog"
      @click="togglePopup"
    >
      <span class="symbol-chip__code">{{ symbol }}</span>
      <span v-if="loading" class="symbol-chip__spinner" aria-hidden="true" />
      <IconTablerAlertTriangle v-else-if="error" class="symbol-chip__warn" aria-hidden="true" />
    </button>
    <Transition name="symbol-popover">
      <div v-if="showPopup" class="symbol-popover" role="dialog" aria-label="切换合约">
        <div class="symbol-search">
          <span class="symbol-search__icon" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" stroke-width="1.6" />
              <line
                x1="10.5"
                y1="10.5"
                x2="14.5"
                y2="14.5"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
              />
            </svg>
          </span>
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            class="symbol-search__input"
            type="text"
            placeholder="搜索代码或名称…"
            autocomplete="off"
            spellcheck="false"
            aria-label="搜索商品"
            @input="onSearchInput"
          />
          <button
            v-if="searchQuery"
            type="button"
            class="symbol-search__clear"
            aria-label="清空搜索"
            @click="clearSearch"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <line
                x1="1"
                y1="1"
                x2="11"
                y2="11"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
              />
              <line
                x1="11"
                y1="1"
                x2="1"
                y2="11"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </div>

        <div class="symbol-list" role="listbox" aria-label="商品列表">
          <div v-if="filteredSymbols.length === 0" class="symbol-list__empty">
            <svg
              width="32"
              height="32"
              viewBox="0 0 32 32"
              fill="none"
              style="margin-bottom: 8px; opacity: 0.35"
            >
              <circle cx="13" cy="13" r="10" stroke="currentColor" stroke-width="2" />
              <line
                x1="21"
                y1="21"
                x2="29"
                y2="29"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              />
            </svg>
            <span>未找到相关商品</span>
          </div>
          <button
            v-for="item in filteredSymbols"
            :key="item.code"
            type="button"
            class="symbol-list__item"
            :class="{ 'is-active': item.code === symbol }"
            role="option"
            :aria-selected="item.code === symbol"
            @click="selectSymbol(item)"
          >
            <span class="symbol-list__left">
              <span class="symbol-list__code">{{ item.code }}</span>
              <span class="symbol-list__desc">{{ item.description }}</span>
            </span>
            <span class="symbol-list__exchange">{{ item.exchange }}</span>
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import IconTablerAlertTriangle from '~icons/tabler/alert-triangle'

export interface SymbolItem {
  code: string
  description: string
  exchange: string
  source: string
}

const props = defineProps<{
  symbol: string
  symbols: SymbolItem[]
  loading?: boolean
  error?: boolean
}>()

const emit = defineEmits<{
  (e: 'change', symbol: SymbolItem): void
}>()

const showPopup = ref(false)
const searchQuery = ref('')
const searchInputRef = ref<HTMLInputElement | null>(null)
const chipWrapRef = ref<HTMLElement | null>(null)

const filteredSymbols = computed<SymbolItem[]>(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return props.symbols
  return props.symbols.filter(
    (s) =>
      s.code.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.exchange.toLowerCase().includes(q),
  )
})

function togglePopup() {
  showPopup.value = !showPopup.value
  if (showPopup.value) {
    nextTick(() => searchInputRef.value?.focus())
  }
}

function clearSearch() {
  searchQuery.value = ''
  searchInputRef.value?.focus()
}

function onSearchInput() {
}

function selectSymbol(item: SymbolItem) {
  emit('change', item)
  showPopup.value = false
  searchQuery.value = ''
}

function onDocumentClick(e: MouseEvent) {
  if (chipWrapRef.value && !chipWrapRef.value.contains(e.target as Node)) {
    showPopup.value = false
  }
}

onMounted(() => document.addEventListener('mousedown', onDocumentClick))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocumentClick))

watch(() => props.symbol, () => {
  showPopup.value = false
  searchQuery.value = ''
})
</script>

<style scoped>
.symbol-chip-wrap {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
}

.symbol-chip {
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  max-width: 160px;
  padding: 0 10px;
  gap: 5px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--klc-color-foreground);
  font: inherit;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}

.symbol-chip:hover,
.symbol-chip.is-open {
  border-color: var(--klc-color-border-button);
  background: var(--klc-color-grid-minor);
}

.symbol-chip.is-open .symbol-chip__arrow {
  transform: rotate(180deg);
}

.symbol-chip__code {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.01em;
}

.symbol-chip__arrow {
  color: var(--klc-color-axis-text);
  font-size: 12px;
  line-height: 1;
  transition: transform 0.15s ease;
}

.symbol-popover {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 20;
  width: min(320px, calc(100vw - 24px));
  padding: 14px;
  border: 1px solid var(--klc-color-border-button);
  border-radius: 3px;
  background: var(--klc-color-tag-bg-white);
  color: var(--klc-color-foreground);
  
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.symbol-search {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  height: 32px;
  border: 1px solid var(--klc-color-border-button);
  border-radius: 8px;
  background: var(--klc-color-background);
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.symbol-search:focus-within {
  border-color: var(--klc-color-axis-text);
}

.symbol-search__icon {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  color: var(--klc-color-axis-text);
}

.symbol-search__input {
  flex: 1 1 0;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--klc-color-foreground);
  font: inherit;
  font-size: 13px;
  line-height: 1;
}

.symbol-search__input::placeholder {
  color: var(--klc-color-axis-text);
  opacity: 0.7;
}

.symbol-search__clear {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: var(--klc-color-grid-major);
  color: var(--klc-color-axis-text);
  cursor: pointer;
  padding: 0;
  transition:
    background 0.12s ease,
    color 0.12s ease;
}

.symbol-search__clear:hover {
  background: var(--klc-color-axis-text);
  color: var(--klc-color-background);
}

.symbol-list {
  max-height: 280px;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  margin: 0 -4px;
}

.symbol-list::-webkit-scrollbar {
  width: 6px;
}
.symbol-list::-webkit-scrollbar-thumb {
  background: var(--klc-color-border-button);
  border-radius: 999px;
}

.symbol-list__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 28px 0;
  color: var(--klc-color-axis-text);
  font-size: 13px;
  text-align: center;
  gap: 2px;
}

.symbol-list__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 10px;
  margin: 0 4px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--klc-color-foreground);
  font: inherit;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s ease;
  flex-shrink: 0;
}

.symbol-list__item:hover {
  background: var(--klc-color-grid-minor);
}

.symbol-list__item.is-active {
  background: color-mix(in srgb, var(--klc-color-alert-active) 10%, transparent);
}

.symbol-list__left {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  flex: 1 1 0;
}

.symbol-list__code {
  font-size: 13px;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: 0.01em;
  color: var(--klc-color-foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.symbol-list__desc {
  font-size: 11px;
  font-weight: 400;
  line-height: 1.2;
  color: var(--klc-color-axis-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.symbol-list__exchange {
  flex: 0 0 auto;
  padding: 2px 7px;
  border-radius: 4px;
  background: var(--klc-color-grid-major);
  color: var(--klc-color-axis-text);
  font-size: 10px;
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  white-space: nowrap;
}

.symbol-list__item.is-active .symbol-list__exchange {
  background: color-mix(in srgb, var(--klc-color-alert-active) 16%, transparent);
  color: var(--klc-color-alert-active);
}

.symbol-popover-enter-active,
.symbol-popover-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.symbol-popover-enter-from,
.symbol-popover-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (max-width: 768px), (max-height: 640px) {
  .symbol-chip {
    height: 26px;
    max-width: 120px;
    padding: 0 8px;
  }

  .symbol-chip__code {
    font-size: 13px;
  }

  .symbol-popover {
    width: min(292px, calc(100vw - 16px));
    padding: 12px;
    gap: 8px;
  }

  .symbol-list {
    max-height: 220px;
  }
}

.symbol-chip__spinner {
  width: 12px;
  height: 12px;
  border: 2px solid var(--klc-color-axis-text);
  border-top-color: transparent;
  border-radius: 50%;
  animation: symbol-spin 0.6s linear infinite;
}

@keyframes symbol-spin {
  to {
    transform: rotate(360deg);
  }
}

.symbol-chip__warn {
  width: 14px;
  height: 14px;
  color: var(--klc-color-danger, #e53935);
  flex-shrink: 0;
}
</style>
