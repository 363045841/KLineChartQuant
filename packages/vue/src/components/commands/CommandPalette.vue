<!-- ⌘K / Ctrl+K 命令面板：检索命令、设置与品种。基于 Reka UI Combobox（role=combobox + listbox + aria-activedescendant），外层沿用 BaseModal。 -->
<template>
  <BaseModal
    :show="open"
    width="min(92vw, 560px)"
    max-height="min(520px, calc(100vh - 96px))"
    body-padding="0"
    :body-scrollable="false"
    :show-close="false"
    @close="close"
  >
    <ComboboxRoot
      class="command-palette"
      :open="true"
      :ignore-filter="true"
      :reset-search-term-on-blur="false"
      :reset-search-term-on-select="false"
      :model-value="undefined"
      @update:model-value="onSelect"
      @update:open="onOpenChange"
    >
      <ComboboxAnchor class="command-palette__search">
        <IconTablerSearch class="command-palette__search-icon" aria-hidden="true" />
        <ComboboxInput
          v-model="query"
          class="command-palette__input"
          :auto-focus="true"
          aria-label="搜索命令、设置与品种"
          placeholder="搜索命令、设置与品种…"
        />
        <kbd class="command-palette__esc" aria-hidden="true">Esc</kbd>
      </ComboboxAnchor>

      <ComboboxContent
        class="command-palette__content"
        position="inline"
        @escape-key-down="close"
      >
        <ComboboxViewport class="command-palette__viewport">
          <ComboboxEmpty class="command-palette__empty">没有匹配的结果</ComboboxEmpty>
          <ComboboxGroup v-for="group in groups" :key="group.id" class="command-palette__group">
            <ComboboxLabel class="command-palette__group-label">{{ group.label }}</ComboboxLabel>
            <ComboboxItem
              v-for="item in group.items"
              :key="item.key"
              :value="item.key"
              :text-value="item.title"
              class="command-palette__item"
            >
              <span class="command-palette__item-text">
                <span class="command-palette__item-title">{{ item.title }}</span>
                <span v-if="item.subtitle" class="command-palette__item-subtitle">
                  {{ item.subtitle }}
                </span>
              </span>
              <kbd v-if="item.shortcut" class="command-palette__kbd">{{ item.shortcut }}</kbd>
            </ComboboxItem>
          </ComboboxGroup>
        </ComboboxViewport>
      </ComboboxContent>
    </ComboboxRoot>
  </BaseModal>
</template>

<script setup lang="ts">
  import { type CommandRegistry, primaryShortcut } from '@363045841yyt/klinechart-core'
  import {
    ComboboxAnchor,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxGroup,
    ComboboxInput,
    ComboboxItem,
    ComboboxLabel,
    ComboboxRoot,
    ComboboxViewport,
  } from 'reka-ui'
  import { computed, ref, watch } from 'vue'
  import IconTablerSearch from '~icons/tabler/search'
  import { COMMAND_GROUPS } from '../../composables/commands/chartCommands.js'
  import type { PaletteSource } from '../../composables/commands/paletteTypes.js'
  import { injectCommands, useCommandList } from '../../composables/commands/useCommands.js'
  import BaseModal from '../BaseModal.vue'

  interface PaletteRow {
    readonly key: string
    readonly title: string
    readonly subtitle?: string
    readonly shortcut?: string
    readonly run: () => void
  }

  const props = withDefaults(
    defineProps<{
      /** 命令注册表；省略时注入最近图表的注册表。 */
      registry?: CommandRegistry | null
      sources?: ReadonlyArray<PaletteSource>
      /** 每个分组最多显示的条目数。 */
      limit?: number
    }>(),
    { registry: undefined, sources: () => [], limit: 8 },
  )

  const open = defineModel<boolean>('open', { default: false })
  const query = ref('')
  const resolvedRegistry = props.registry === undefined ? injectCommands() : props.registry
  // 订阅命令列表，注册/注销命令时结果随之刷新。
  const commandList = useCommandList(resolvedRegistry)

  watch(open, (value) => {
    if (value) query.value = ''
  })

  const groupTitle = new Map(COMMAND_GROUPS.map((group) => [group.id, group.title.zh]))

  const groups = computed(() => {
    void commandList.value
    const commands = resolvedRegistry
    const result: { id: string; label: string; items: PaletteRow[] }[] = []
    if (commands) {
      const byGroup = new Map<string, PaletteRow[]>()
      for (const { command } of commands.search(query.value)) {
        const group = command.group ?? 'general'
        const rows = byGroup.get(group) ?? []
        if (rows.length >= props.limit) continue
        const combo = primaryShortcut(command)
        rows.push({
          key: `command:${command.id}`,
          title: command.title.zh,
          subtitle: command.title.en,
          ...(combo ? { shortcut: commands.formatShortcut(combo) } : {}),
          run: () => {
            void commands.execute(command.id)
          },
        })
        byGroup.set(group, rows)
      }
      // 有查询时按最佳匹配所在分组排序；空查询时按固定分组顺序。
      const order = query.value.trim()
        ? [...byGroup.keys()]
        : COMMAND_GROUPS.map((group) => group.id).filter((id) => byGroup.has(id))
      for (const id of order) {
        result.push({ id, label: groupTitle.get(id) ?? id, items: byGroup.get(id) ?? [] })
      }
    }
    for (const source of props.sources) {
      const items = source.items(query.value).slice(0, props.limit)
      if (items.length === 0) continue
      result.push({
        id: `source:${source.id}`,
        label: source.label,
        items: items.map((item) => ({
          key: `${source.id}:${item.id}`,
          title: item.title,
          ...(item.subtitle ? { subtitle: item.subtitle } : {}),
          run: item.run,
        })),
      })
    }
    return result
  })

  const rowsByKey = computed(
    () => new Map(groups.value.flatMap((group) => group.items.map((row) => [row.key, row]))),
  )

  function close(): void {
    open.value = false
  }

  function onOpenChange(value: boolean): void {
    if (!value) close()
  }

  /** 先关闭面板再执行，使命令打开的其他弹窗能获得焦点。 */
  function onSelect(value: unknown): void {
    const row = typeof value === 'string' ? rowsByKey.value.get(value) : undefined
    if (!row) return
    close()
    row.run()
  }
</script>

<style scoped>
  .command-palette {
    display: flex;
    flex-direction: column;
    min-block-size: 0;
    max-block-size: inherit;
    font-family: var(--klc-typography-font-family);
    color: var(--klc-color-ui-text);
  }

  .command-palette__search {
    display: flex;
    align-items: center;
    gap: var(--klc-spacing-sm);
    padding: var(--klc-spacing-md);
    border-block-end: 1px solid var(--klc-color-ui-border);
  }

  .command-palette__search-icon {
    flex: none;
    inline-size: 18px;
    block-size: 18px;
    color: var(--klc-color-ui-muted);
  }

  .command-palette__input {
    flex: 1;
    min-inline-size: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: var(--klc-typography-font-size-lg, 15px);
    outline: none;
  }

  .command-palette__esc,
  .command-palette__kbd {
    flex: none;
    padding: 1px 6px;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 4px;
    color: var(--klc-color-ui-muted);
    font-family: var(--klc-typography-font-family-mono);
    font-size: 11px;
    line-height: 18px;
  }

  .command-palette__content {
    min-block-size: 0;
    overflow: hidden;
    display: flex;
  }

  .command-palette__viewport {
    flex: 1;
    max-block-size: min(400px, calc(100vh - 200px));
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: var(--klc-spacing-xs) var(--klc-spacing-sm) var(--klc-spacing-sm);
  }

  .command-palette__empty {
    padding: var(--klc-spacing-lg) var(--klc-spacing-md);
    color: var(--klc-color-ui-muted);
    text-align: center;
  }

  .command-palette__group-label {
    padding: var(--klc-spacing-sm) var(--klc-spacing-sm) var(--klc-spacing-xs);
    color: var(--klc-color-ui-muted);
    font-size: var(--klc-typography-font-size-sm, 12px);
    font-weight: var(--klc-typography-font-weight-bold);
  }

  .command-palette__item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--klc-spacing-md);
    min-block-size: 36px;
    padding: var(--klc-spacing-xs) var(--klc-spacing-sm);
    border-radius: 6px;
    cursor: pointer;
    user-select: none;
  }

  .command-palette__item[data-highlighted] {
    background: var(--klc-color-ui-hover);
  }

  .command-palette__item-text {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }

  .command-palette__item-title,
  .command-palette__item-subtitle {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .command-palette__item-subtitle {
    color: var(--klc-color-ui-muted);
    font-size: var(--klc-typography-font-size-sm, 12px);
  }
</style>
