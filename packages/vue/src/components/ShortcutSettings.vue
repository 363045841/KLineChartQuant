<!--
  快捷键设置：按注册顺序列出命令，逐行录入/清除快捷键。
  快捷键变更直接写入命令注册表；冲突时提示并保留原绑定。
-->
<template>
  <section class="shortcut-settings">
    <div v-if="rows.length > 0" class="shortcut-settings__list">
      <ShortcutSettingsRow
        v-for="row in rows"
        :key="row.id"
        :id="row.id"
        :title="row.title"
        :value="values[row.id] ?? ''"
        :capturing="editingId === row.id"
        :icon="iconFor(row.id)"
        @begin="beginCapture(row.id)"
        @keydown="capture($event, row.id)"
        @blur="endCapture(row.id)"
        @clear="clear(row.id)"
      />
    </div>

    <p v-else class="shortcut-settings__empty">暂无可配置的快捷键</p>
    <p v-if="error" class="shortcut-settings__error" role="alert">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
  import {
    type CommandDef,
    type CommandRegistry,
    primaryShortcut,
  } from '@363045841yyt/klinechart-core'
  import { computed, nextTick, reactive, ref, watch } from 'vue'
  import { CHART_COMMAND_ICONS } from '../composables/commands/chartCommands.js'
  import { comboFromEvent } from '../composables/commands/keyCombo.js'
  import { injectCommands, useCommandList } from '../composables/commands/useCommands.js'
  import ShortcutSettingsRow from './shortcut-settings/ShortcutSettingsRow.vue'

  const props = defineProps<{ registry?: CommandRegistry | null }>()
  const registry = props.registry === undefined ? injectCommands() : props.registry
  const commandList = useCommandList(registry)
  const values = reactive<Record<string, string>>({})
  const editingId = ref<string | null>(null)
  const error = ref('')

  // 保持注册表的原始顺序；快捷键修改只更新值，不在这里排序。
  const rows = computed(() =>
    commandList.value
      .filter((command) => command.palette !== false)
      .map((command) => ({ id: command.id, title: command.title })),
  )

  function syncCommand(command: CommandDef): void {
    if (!registry) return
    const combo = primaryShortcut(command)
    values[command.id] = combo ? registry.formatShortcut(combo) : ''
  }

  function syncAll(): void {
    for (const command of commandList.value) syncCommand(command)
  }

  function beginCapture(id: string): void {
    editingId.value = id
    error.value = ''
    void nextTick(() => {
      document.querySelector<HTMLButtonElement>(`[data-shortcut-id="${CSS.escape(id)}"]`)?.focus()
    })
  }

  /** 失焦即退出录入态；只有录入态才拦截键盘事件。 */
  function endCapture(id: string): void {
    if (editingId.value === id) editingId.value = null
  }

  function capture(event: KeyboardEvent, id: string): void {
    // 非录入态不拦截事件，让快捷键正常冒泡给图表命令。
    if (editingId.value !== id) return
    event.stopPropagation()
    if (event.key === 'Escape') {
      event.preventDefault()
      editingId.value = null
      return
    }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault()
      apply(id, null)
      return
    }
    const combo = comboFromEvent(event)
    if (!combo) return
    event.preventDefault()
    apply(id, combo)
  }

  function apply(id: string, combo: string | null): void {
    if (!registry) return
    try {
      registry.setShortcut(id, combo)
      error.value = ''
      editingId.value = null
      syncAll()
    } catch {
      error.value = '快捷键已被其他命令占用'
      syncAll()
    }
  }

  function clear(id: string): void {
    apply(id, null)
  }

  /** 命令对应的功能图标；未登记图标的命令返回 null。 */
  function iconFor(id: string): (typeof CHART_COMMAND_ICONS)[string] | null {
    return CHART_COMMAND_ICONS[id] ?? null
  }

  syncAll()
  watch(commandList, syncAll)
</script>

<style scoped>
  .shortcut-settings {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .shortcut-settings__empty,
  .shortcut-settings__error {
    margin: 4px 0 0;
    color: var(--klc-color-ui-muted);
    font-size: 12px;
  }

  .shortcut-settings__list {
    display: flex;
    flex-direction: column;
  }

  .shortcut-settings__error {
    color: var(--klc-color-ui-danger, var(--klc-color-ui-text));
  }
</style>
