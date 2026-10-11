<!--
  ⌘K 命令面板：检索并执行命令注册表中的命令。
  外观沿用商品选择弹窗（BaseModal + SearchField + 列表），支持方向键与 Enter。
-->
<template>
  <BaseModal
    :open="open"
    @update:open="emit('update:open', $event)"
    title="命令面板"
    width="min(560px, calc(100vw - 32px))"
    max-height="calc(100dvh - 32px)"
    body-padding="0"
    :body-scrollable="false"
  >
    <div class="command-palette" @keydown="onKeydown">
      <div class="command-palette__search">
        <SearchField
          ref="searchField"
          v-model="query"
          placeholder="搜索命令…"
          aria-label="搜索命令"
          variant="flush"
          autofocus
        />
        <slot name="search-actions">
          <BaseTooltip content="快捷键设置" placement="bottom">
            <button
              type="button"
              class="command-palette__settings"
              aria-label="快捷键设置"
              @click="openShortcutSettings"
            >
              <IconTablerKeyboard aria-hidden="true" />
            </button>
          </BaseTooltip>
        </slot>
      </div>
      <div
        class="command-palette__list"
        role="listbox"
        aria-label="命令列表"
        @pointermove="keyboardNavigation = false"
      >
        <div v-if="results.length === 0" class="command-palette__empty">没有匹配的命令</div>
        <button
          v-for="(row, index) in results"
          :key="row.command.id"
          type="button"
          class="command-palette__item"
          :class="{
            'is-active': keyboardNavigation && index === activeIndex,
            'is-disabled': !row.available,
          }"
          :disabled="!row.available"
          role="option"
          :aria-selected="index === activeIndex"
          @mousemove="activeIndex = index"
          @click="run(row)"
        >
          <span class="list-text">
            <span class="command-palette__title">{{ row.command.title.zh }}</span>
            <span class="command-palette__desc">{{ row.command.title.en }}</span>
          </span>
          <ShortcutKeys :shortcut="shortcutOf(row.command)" aria-label="快捷键" />
        </button>
      </div>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
  import {
    type CommandDef,
    type CommandMatch,
    type CommandRegistry,
    primaryShortcut,
  } from '@363045841yyt/klinechart-core'
  import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
  import IconTablerKeyboard from '~icons/tabler/keyboard'
  import { comboFromEvent } from '../../composables/commands/keyCombo.js'
  import { injectCommands, useCommandList } from '../../composables/commands/useCommands.js'
  import BaseModal from '../BaseModal.vue'
  import BaseTooltip from '../common/BaseTooltip.vue'
  import SearchField from '../common/SearchField.vue'
  import ShortcutKeys from '../common/ShortcutKeys.vue'

  const props = withDefaults(
    defineProps<{
      open: boolean
      /** 命令注册表；省略时注入最近图表的注册表。 */
      registry?: CommandRegistry | null
    }>(),
    { registry: undefined },
  )
  const emit = defineEmits<{
    (event: 'openShortcuts'): void
    (event: 'update:open', value: boolean): void
  }>()
  const registry = props.registry === undefined ? injectCommands() : props.registry
  const commands = useCommandList(registry)
  const query = ref('')
  const activeIndex = ref(-1)
  const keyboardNavigation = ref(false)
  const searchField = useTemplateRef<InstanceType<typeof SearchField>>('searchField')

  /** 当前查询下的命令结果（已按得分排序）。 */
  const results = computed<ReadonlyArray<CommandMatch>>(() => {
    void commands.value // 订阅命令列表变化，注册/注销时刷新
    return registry ? registry.search(query.value) : []
  })

  watch(
    () => props.open,
    (isOpen) => {
      if (!isOpen) return
      query.value = ''
      activeIndex.value = -1
      keyboardNavigation.value = false
      void nextTick(() => requestAnimationFrame(() => searchField.value?.focus()))
    },
  )

  watch(results, () => {
    activeIndex.value = -1
    keyboardNavigation.value = false
  })

  /** 命令首个快捷键的平台化展示，无快捷键返回 null。 */
  function shortcutOf(command: CommandDef): string | null {
    const combo = primaryShortcut(command)
    return combo && registry ? registry.formatShortcut(combo) : null
  }

  /** 关闭面板。 */
  function close(): void {
    emit('update:open', false)
  }

  function openShortcutSettings(): void {
    close()
    emit('openShortcuts')
  }

  /** 先关闭面板再执行命令，使命令打开的弹窗能获得焦点；不可用的命令不执行。 */
  function run(row: CommandMatch): void {
    if (!row.available) return
    close()
    void registry?.execute(row.command.id)
  }

  /** 面板内键盘处理：搜索框里的组合键优先，其次才是列表导航。 */
  function onKeydown(event: KeyboardEvent): void {
    if (event.target instanceof HTMLInputElement) {
      // 面板搜索期间拦截事件冒泡，避免 Ctrl+Z / Ctrl+K 等误触发图表命令。
      if (event.key !== 'Escape') event.stopPropagation()
      if (captureSearchCombo(event)) return
    }
    moveActive(event)
  }

  /** 搜索框内按下组合键时，格式化后填入查询；处理成功返回 true。 */
  function captureSearchCombo(event: KeyboardEvent): boolean {
    if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) return false
    const combo = comboFromEvent(event)
    if (!combo) return false
    event.preventDefault()
    query.value = registry?.formatShortcut(combo) ?? combo
    activeIndex.value = -1
    keyboardNavigation.value = false
    return true
  }

  /** 方向键移动高亮，Enter 执行当前项。 */
  function moveActive(event: KeyboardEvent): void {
    const total = results.value.length
    if (total === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      keyboardNavigation.value = true
      activeIndex.value = activeIndex.value < 0 ? 0 : (activeIndex.value + 1) % total
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      keyboardNavigation.value = true
      activeIndex.value =
        activeIndex.value < 0 ? total - 1 : (activeIndex.value - 1 + total) % total
    } else if (event.key === 'Enter') {
      const row = results.value[activeIndex.value]
      if (!row) return
      event.preventDefault()
      run(row)
    }
  }
</script>

<style scoped>
  .command-palette {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .command-palette__search {
    display: flex;
    align-items: center;
    min-height: 42px;
    border-bottom: 1px solid var(--klc-color-ui-border);
    background: var(--klc-color-ui-surface);
  }

  .command-palette__settings {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 28px;
    height: 28px;
    margin-right: var(--klc-space-8, 8px);
    padding: 0;
    border: 0;
    border-radius: var(--klc-radius-sm, 6px);
    background: transparent;
    color: var(--klc-color-ui-muted);
    cursor: pointer;
  }

  .command-palette__settings:hover {
    background: var(--klc-color-ui-hover);
    color: var(--klc-color-ui-text);
  }

  .command-palette__settings svg {
    width: 16px;
    height: 16px;
  }

  .command-palette__list {
    display: flex;
    flex-direction: column;
    max-height: 480px;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .command-palette__empty {
    padding: 28px 0;
    color: var(--klc-color-ui-muted);
    font-size: 13px;
    text-align: center;
  }

  .command-palette__item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin: 0;
    padding: 10px 12px;
    border: 0;
    border-bottom: 1px solid var(--klc-color-ui-border);
    background: transparent;
    color: var(--klc-color-ui-text);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: background 0.12s ease;
    flex-shrink: 0;
  }

  .command-palette__item.is-active {
    background: var(--klc-color-ui-selected, var(--klc-color-ui-hover));
  }

  .command-palette__item:hover:not(:disabled) {
    background: var(--klc-color-ui-hover);
  }

  .command-palette__item:disabled {
    cursor: default;
  }

  .command-palette__item.is-disabled .command-palette__title,
  .command-palette__item.is-disabled :deep(.shortcut-key) {
    color: var(--klc-color-ui-text-soft);
  }

  .command-palette__item.is-disabled .command-palette__desc {
    color: var(--klc-color-ui-muted);
  }

  .command-palette__item:last-child {
    border-bottom: 0;
  }

  .command-palette__title {
    font-size: 13px;
    font-weight: 600;
    line-height: 1.2;
    overflow-wrap: anywhere;
  }

  .command-palette__desc {
    font-size: 11px;
    line-height: 1.2;
    color: var(--klc-color-ui-muted);
    overflow-wrap: anywhere;
  }

  @media (max-width: 768px), (max-height: 640px) {
    .command-palette__list {
      max-height: 320px;
    }
  }
</style>

<style scoped src="../common/list-text.css"></style>
