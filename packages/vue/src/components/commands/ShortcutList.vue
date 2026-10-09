<!-- 快捷键列表：从命令注册表生成，设置对话框“快捷键”分区与 ? 快捷键表共用。 -->
<template>
  <div class="shortcut-list">
    <p v-if="groups.length === 0" class="shortcut-list__empty">暂无快捷键</p>
    <section
      v-for="group in groups"
      :key="group.id"
      class="shortcut-list__group"
      :aria-labelledby="`${idPrefix}-${group.id}`"
    >
      <h3 :id="`${idPrefix}-${group.id}`" class="shortcut-list__title">{{ group.label }}</h3>
      <dl class="shortcut-list__rows">
        <div v-for="row in group.rows" :key="row.id" class="shortcut-list__row">
          <dt>{{ row.title }}</dt>
          <dd>
            <template v-for="(combo, index) in row.combos" :key="combo">
              <span v-if="index > 0" class="shortcut-list__or">或</span>
              <kbd class="shortcut-list__kbd">{{ combo }}</kbd>
            </template>
          </dd>
        </div>
      </dl>
    </section>
  </div>
</template>

<script setup lang="ts">
  import type { CommandRegistry } from '@363045841yyt/klinechart-core'
  import { computed, useId } from 'vue'
  import { COMMAND_GROUPS } from '../../composables/commands/chartCommands.js'
  import { injectCommands, useCommandList } from '../../composables/commands/useCommands.js'

  const props = withDefaults(defineProps<{ registry?: CommandRegistry | null }>(), {
    registry: undefined,
  })

  const registry = props.registry === undefined ? injectCommands() : props.registry
  const commands = useCommandList(registry)
  const idPrefix = useId()

  const groups = computed(() => {
    const byGroup = new Map<string, { id: string; title: string; combos: string[] }[]>()
    for (const command of commands.value) {
      if (command.shortcut === undefined || !registry) continue
      const combos = typeof command.shortcut === 'string' ? [command.shortcut] : command.shortcut
      const group = command.group ?? 'general'
      const rows = byGroup.get(group) ?? []
      rows.push({
        id: command.id,
        title: command.title.zh,
        combos: combos.map((combo) => registry.formatShortcut(combo)),
      })
      byGroup.set(group, rows)
    }
    const known = COMMAND_GROUPS.filter((group) => byGroup.has(group.id)).map((group) => ({
      id: group.id,
      label: group.title.zh,
      rows: byGroup.get(group.id) ?? [],
    }))
    const extra = [...byGroup.keys()]
      .filter((id) => !COMMAND_GROUPS.some((group) => group.id === id))
      .map((id) => ({ id, label: id, rows: byGroup.get(id) ?? [] }))
    return [...known, ...extra]
  })
</script>

<style scoped>
  .shortcut-list {
    display: flex;
    flex-direction: column;
    gap: var(--klc-spacing-md);
    font-family: var(--klc-typography-font-family);
    color: var(--klc-color-ui-text);
  }

  .shortcut-list__title {
    margin: 0 0 var(--klc-spacing-xs);
    padding-inline: var(--klc-spacing-sm);
    color: var(--klc-color-ui-muted);
    font-size: var(--klc-typography-font-size-md);
    font-weight: var(--klc-typography-font-weight-bold);
  }

  .shortcut-list__rows {
    margin: 0;
  }

  .shortcut-list__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--klc-spacing-md);
    min-block-size: 32px;
    padding-inline: var(--klc-spacing-sm);
  }

  .shortcut-list__row dt,
  .shortcut-list__row dd {
    margin: 0;
  }

  .shortcut-list__row dd {
    display: inline-flex;
    align-items: center;
    gap: var(--klc-spacing-xs);
  }

  .shortcut-list__or,
  .shortcut-list__empty {
    color: var(--klc-color-ui-muted);
  }

  .shortcut-list__kbd {
    min-inline-size: 20px;
    padding: 1px 6px;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 4px;
    font-family: var(--klc-typography-font-family-mono);
    font-size: 11px;
    line-height: 18px;
    text-align: center;
  }
</style>
