<template>
  <div ref="rootRef" class="compare-chip-wrap">
    <button
      type="button"
      class="compare-chip"
      :class="{ 'is-open': showPopup }"
      title="比较商品"
      :aria-expanded="showPopup"
      aria-haspopup="dialog"
      @click="togglePopup"
    >
      <span class="compare-chip__icon" aria-hidden="true">+</span>
      <span class="compare-chip__text">比较商品</span>
      <span v-if="selected.length > 0" class="compare-chip__badge">{{ selected.length }}</span>
    </button>
    <Transition name="symbol-popover">
      <div v-if="showPopup" class="compare-popover" role="dialog" aria-label="比较商品">
        <div class="compare-search">
          <span class="compare-search__icon" aria-hidden="true">
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
            class="compare-search__input"
            type="text"
            placeholder="搜索代码或名称…"
            autocomplete="off"
            spellcheck="false"
            aria-label="搜索比较商品"
          />
          <button
            v-if="searchQuery"
            type="button"
            class="compare-search__clear"
            aria-label="清空搜索"
            @click="clearSearch"
          >
            <svg class="delete-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
          </button>
        </div>

        <div v-if="selected.length > 0" class="compare-selected">
          <div class="compare-selected__header">
            <span class="compare-selected__title">已添加商品</span>
          </div>
          <div class="compare-selected__list">
            <div
              v-for="item in selectedItems"
              :key="item.code"
              class="compare-selected__item"
            >
              <span class="compare-selected__code">{{ item.code }}</span>
              <span class="compare-selected__desc">{{ item.description }}</span>
              <button
                type="button"
                class="compare-selected__remove"
                :aria-label="'移除 ' + item.code"
                @click="removeSymbol(item.code)"
              >
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 6L6 18" />
                  <path d="M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div class="compare-list" role="listbox" aria-label="商品列表">
          <div v-if="filteredSymbols.length === 0" class="compare-list__empty">
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
            class="compare-list__item"
            :class="{ 'is-selected': isSelected(item.code) }"
            role="option"
            :aria-selected="isSelected(item.code)"
            @click="toggleSymbol(item)"
          >
            <span class="compare-list__left">
              <span class="compare-list__code">{{ item.code }}</span>
              <span class="compare-list__desc">{{ item.description }}</span>
            </span>
            <span class="compare-list__right">
              <span class="compare-list__exchange">{{ item.exchange }}</span>
              <span v-if="isSelected(item.code)" class="compare-list__check" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
            </span>
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import type { SymbolItem } from './SymbolSelector.vue'

const props = withDefaults(defineProps<{
  symbols: SymbolItem[]
  selected?: string[]
}>(), {
  selected: () => [],
})

const emit = defineEmits<{
  (e: 'add', item: SymbolItem): void
  (e: 'remove', code: string): void
}>()

const showPopup = ref(false)
const searchQuery = ref('')
const searchInputRef = ref<HTMLInputElement | null>(null)
const rootRef = ref<HTMLElement | null>(null)

const selectedSet = computed(() => new Set(props.selected ?? []))

const selectedItems = computed<SymbolItem[]>(() => {
  const set = selectedSet.value
  return props.symbols.filter((s) => set.has(s.code))
})

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

function isSelected(code: string): boolean {
  return selectedSet.value.has(code)
}

function toggleSymbol(item: SymbolItem) {
  if (isSelected(item.code)) {
    emit('remove', item.code)
  } else {
    emit('add', item)
  }
}

function removeSymbol(code: string) {
  emit('remove', code)
}

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

function onDocumentClick(e: MouseEvent) {
  if (rootRef.value && !rootRef.value.contains(e.target as Node)) {
    showPopup.value = false
    searchQuery.value = ''
  }
}

onMounted(() => document.addEventListener('mousedown', onDocumentClick))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocumentClick))
</script>

<style scoped>
.compare-chip-wrap {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
}

.compare-chip {
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid var(--klc-color-border-button);
  border-radius: 4px;
  background: var(--klc-color-background);
  color: var(--klc-color-foreground);
  font: inherit;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}

.compare-chip:hover,
.compare-chip.is-open {
  border-color: var(--klc-color-axis-text);
  background: var(--klc-color-grid-minor);
}

.compare-chip__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--klc-color-foreground);
  color: var(--klc-color-background);
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
}

.compare-chip__text {
  font-size: 13px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
}

.compare-chip__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--klc-color-axis-text);
  color: var(--klc-color-background);
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
}

.compare-popover {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 20;
  width: min(360px, calc(100vw - 24px));
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

.compare-search {
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

.compare-search:focus-within {
  border-color: var(--klc-color-axis-text);
}

.compare-search__icon {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  color: var(--klc-color-axis-text);
}

.compare-search__input {
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

.compare-search__input::placeholder {
  color: var(--klc-color-axis-text);
  opacity: 0.7;
}

.compare-search__clear {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--klc-color-axis-text);
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
}

.compare-search__clear:hover {
  border-color: var(--klc-color-axis-line);
  background: var(--klc-color-grid-minor);
  color: var(--klc-color-foreground);
}

.compare-search__clear .delete-icon {
  width: 14px;
  height: 14px;
}

.compare-selected {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--klc-color-border-chart);
}

.compare-selected__header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.compare-selected__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--klc-color-axis-text);
}

.compare-selected__list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.compare-selected__item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border: 1px solid var(--klc-color-border-button);
  border-radius: 6px;
  background: var(--klc-color-grid-minor);
  font-size: 12px;
  line-height: 1.3;
}

.compare-selected__code {
  font-weight: 600;
  color: var(--klc-color-foreground);
}

.compare-selected__desc {
  color: var(--klc-color-axis-text);
  font-size: 11px;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compare-selected__remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--klc-color-axis-text);
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
  flex-shrink: 0;
}

.compare-selected__remove:hover {
  background: color-mix(in srgb, var(--klc-color-alert-active) 16%, transparent);
  color: var(--klc-color-alert-active);
}

.compare-list {
  max-height: 220px;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  margin: 0 -4px;
}

.compare-list::-webkit-scrollbar {
  width: 6px;
}

.compare-list::-webkit-scrollbar-thumb {
  background: var(--klc-color-border-button);
  border-radius: 999px;
}

.compare-list__empty {
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

.compare-list__item {
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

.compare-list__item:hover {
  background: var(--klc-color-grid-minor);
}

.compare-list__left {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  flex: 1 1 0;
}

.compare-list__code {
  font-size: 13px;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: 0.01em;
  color: var(--klc-color-foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compare-list__desc {
  font-size: 11px;
  font-weight: 400;
  line-height: 1.2;
  color: var(--klc-color-axis-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compare-list__right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}

.compare-list__exchange {
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

.compare-list__check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--klc-color-alert-active);
  flex-shrink: 0;
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
  .compare-chip {
    height: 26px;
    padding: 0 8px;
  }

  .compare-popover {
    width: min(330px, calc(100vw - 16px));
    padding: 12px;
    gap: 8px;
  }

  .compare-list {
    max-height: 180px;
  }
}
</style>
