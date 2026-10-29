<!-- 文件树行：目录行只多一个新建入口，文件行只多状态图标；交互由父级处理。 -->
<template>
  <div v-if="row.type === 'folder'" class="script-files__folder-button">
    <button
      type="button"
      class="script-files__dir"
      :style="{ '--script-tree-depth': row.depth }"
      :aria-expanded="row.expanded"
      :disabled="saving"
      @click="emit('activate')"
      @contextmenu="emit('menu', $event)"
    >
      <IconTablerChevronDown v-if="row.expanded" aria-hidden="true" /><IconTablerChevronRight v-else aria-hidden="true" />
      <IconTablerFolder aria-hidden="true" /><span class="script-files__filename">{{ row.name }}</span>
    </button>
    <button
      type="button"
      class="script-files__folder-add"
      :aria-label="`在${row.name}中新建文件`"
      :title="`在${row.name}中新建文件`"
      :disabled="saving"
      @click="emit('create-file')"
    >
      <IconTablerPlus aria-hidden="true" />
    </button>
  </div>
  <button
    v-else
    type="button"
    class="script-files__file"
    :class="{ 'is-active': row.tabId === activeTabId }"
    :style="{ '--script-tree-depth': row.depth }"
    :disabled="saving"
    :title="row.readonly ? `${row.name}.ts · 内置，只读` : `${row.name}.ts`"
    :aria-current="row.tabId === activeTabId ? 'page' : undefined"
    @click="emit('activate')"
    @contextmenu="emit('menu', $event)"
  >
    <span class="script-files__filename">{{ row.name }}.ts</span><ScriptDirtyIndicator v-if="row.dirty" /><IconTablerLock v-else-if="row.readonly" aria-label="只读" />
  </button>
</template>

<script setup lang="ts">
  import type { ScriptTreeRow } from '@vue-src/composables/chart/scriptEditor/types.js'
  import IconTablerChevronDown from '~icons/tabler/chevron-down'
  import IconTablerChevronRight from '~icons/tabler/chevron-right'
  import IconTablerFolder from '~icons/tabler/folder'
  import IconTablerLock from '~icons/tabler/lock'
  import IconTablerPlus from '~icons/tabler/plus'
  import ScriptDirtyIndicator from './ScriptDirtyIndicator.vue'

  defineProps<{
    row: ScriptTreeRow
    activeTabId: string | null
    saving: boolean
  }>()

  const emit = defineEmits<{
    activate: []
    menu: [event: MouseEvent]
    'create-file': []
  }>()
</script>

<style scoped>
  /* 文件行与目录行共用同一套行基础样式，差异只保留宽度和缩进。 */
  .script-files__folder-button { display: flex; align-items: center; padding-right: var(--klc-space-4, 4px); }
  /* 目录行共用行基础样式；border-box 保证 width:100% 不因缩进溢出。 */
  .script-files__dir,
  .script-files__file { display: flex; align-items: center; box-sizing: border-box; gap: var(--klc-space-4, 4px); width: 100%; min-height: 28px; padding: var(--klc-space-4, 4px) var(--klc-space-8, 8px); border: 0; background: transparent; color: var(--klc-color-ui-text); font: inherit; text-align: left; cursor: pointer; }
  /* 层级缩进：depth 由行模型给出，根目录为 0。 */
  .script-files__dir,
  .script-files__file {
    padding-left: calc(var(--klc-space-8, 8px) + var(--script-tree-depth, 0) * var(--klc-space-16, 16px));
  }
  .script-files__dir { flex: 1; min-width: 0; }
  .script-files__folder-button:hover, .script-files__dir:hover, .script-files__file:hover, .script-files__file.is-active { background: var(--klc-color-ui-hover); }
  .script-files__filename { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* 每类目录右侧直接新建，替代数量展示；入口常驻，不依赖悬浮。 */
  .script-files__folder-add { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 20px; height: 20px; padding: 0; border: 0; border-radius: var(--klc-radius-sm, 4px); background: transparent; color: var(--klc-color-ui-muted); cursor: pointer; }
  .script-files__folder-add:hover { background: var(--klc-color-ui-hover); color: var(--klc-color-ui-text); }
  .script-files__folder-add:focus-visible { outline: 2px solid var(--klc-color-ui-focus); outline-offset: -2px; }
  .script-files__folder-add:disabled { opacity: 0.4; cursor: default; }
  .script-files svg { width: 14px; height: 14px; flex-shrink: 0; }
  .script-files button:focus-visible { outline: 2px solid var(--klc-color-ui-focus); outline-offset: -2px; }
</style>
