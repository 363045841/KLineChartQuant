<!-- 脚本文件目录：搜索与树投影；行渲染和右键菜单各自独立。 -->
<template>
  <nav
    class="script-files"
    :class="{ 'is-collapsed': !open }"
    :inert="!open"
    :aria-hidden="!open"
    aria-label="脚本文件目录"
  >
    <div class="script-files__heading">文件</div>
    <SearchField
      v-model="query"
      variant="compact"
      class="script-files__search"
      placeholder="搜索文件…"
      aria-label="搜索指标和库"
    />
    <p v-if="treeError" class="script-files__error" role="alert">{{ treeError }}</p>
    <div ref="treeHost" class="script-files__tree">
      <ul class="script-files__list">
        <li v-for="row in rows" :key="row.key">
          <ScriptFileTreeRow
            :row="row"
            :active-tab-id="activeTabId"
            :saving="saving"
            @activate="activate(row)"
            @menu="openContextMenu($event, row)"
            @create-file="emit('tree-action', { type: 'create-file', kind: row.kind, folder: rowPath(row) })"
          />
        </li>
        <BaseEmptyState v-if="!rows.length" as="li" size="compact" role="status">
          未找到匹配文件
        </BaseEmptyState>
      </ul>
    </div>
  </nav>
</template>

<script setup lang="ts">
  import { useScriptTree } from '@vue-src/composables/chart/scriptEditor/impl/useScriptTree.js'
  import { useScriptTreeMenu } from '@vue-src/composables/chart/scriptEditor/impl/useScriptTreeMenu.js'
  import type {
    ScriptEditorDocument,
    ScriptEditorFolder,
    ScriptEditorTab,
    ScriptTreeAction,
    ScriptTreeRow,
  } from '@vue-src/composables/chart/scriptEditor/types.js'
  import { useTemplateRef } from 'vue'
  import BaseEmptyState from '@vue-src/components/common/BaseEmptyState.vue'
  import SearchField from '@vue-src/components/common/SearchField.vue'
  import ScriptFileTreeRow from './ScriptFileTreeRow.vue'

  const props = withDefaults(
    defineProps<{
      documents?: readonly ScriptEditorDocument[]
      folders?: readonly ScriptEditorFolder[]
      tabs: readonly ScriptEditorTab[]
      activeTabId: string | null
      saving?: boolean
      executing?: 'run' | 'add-to-chart' | null
      /** 目录操作失败；只在本区域展示。 */
      treeError?: string | null
      /** 目录是否展开；折叠后仍保留 DOM 以便过渡。 */
      open?: boolean
    }>(),
    {
      documents: () => [],
      folders: () => [],
      saving: false,
      executing: null,
      treeError: null,
      open: true,
    },
  )

  const emit = defineEmits<{
    'select-tab': [id: string]
    'open-script': [id: string]
    'tree-action': [action: ScriptTreeAction]
  }>()

  /** 目录行在自身路径下新建，文件行在所属目录下新建。 */
  function rowPath(row: ScriptTreeRow): string {
    return row.type === 'folder' ? row.path : row.folder
  }

  const treeHost = useTemplateRef<HTMLElement>('treeHost')
  const { query, rows, activate } = useScriptTree({
    documents: () => props.documents,
    folders: () => props.folders,
    tabs: () => props.tabs,
    activeTabId: () => props.activeTabId,
    select: (id) => emit('select-tab', id),
    openFile: (id) => emit('open-script', id),
  })
  const { openContextMenu } = useScriptTreeMenu({
    apply: (action) => emit('tree-action', action),
    writable: () => !props.saving && !props.executing,
    treeHost,
  })
</script>

<style scoped>
  /* 与底部输出面板一致的宽度折叠动画；收起后仍保留 DOM 以便过渡。 */
  .script-files {
    display: flex;
    flex-direction: column;
    width: clamp(140px, 22%, 230px);
    flex-shrink: 0;
    min-height: 0;
    overflow: hidden;
    border-right: 1px solid var(--klc-color-ui-border);
    background: var(--klc-color-ui-card);
    font-size: var(--klc-text-label-12-font-size, 12px);
    transition:
      width var(--klc-motion-dur-base) var(--klc-motion-ease-standard),
      opacity var(--klc-motion-dur-base) var(--klc-motion-ease-standard),
      border-right-color var(--klc-motion-dur-base) var(--klc-motion-ease-standard);
  }
  .script-files.is-collapsed {
    width: 0;
    opacity: 0;
    border-right-color: transparent;
    pointer-events: none;
  }
  .script-files__heading { padding: var(--klc-space-8, 8px) var(--klc-space-12, 12px); color: var(--klc-color-ui-muted); }
  /* 高度与外观由 SearchField 的 compact 变体自有；此处只负责外边距与纵向不伸缩。 */
  .script-files__search { flex: 0 0 auto; margin: 0 var(--klc-space-8, 8px) var(--klc-space-8, 8px); }
  .script-files__tree { flex: 1; overflow: auto; }
  .script-files__list { margin: 0; padding: 0; list-style: none; }
  /* 目录操作失败留在目录区域，不混入代码问题列表。 */
  .script-files__error {
    margin: 0;
    padding: var(--klc-space-8, 8px) var(--klc-space-12, 12px);
    color: var(--klc-color-ui-danger-text);
    font-size: var(--klc-text-12-font-size, 12px);
    line-height: 1.4;
    overflow-wrap: anywhere;
  }
  @media (max-width: 600px) { .script-files { width: 140px; } }
</style>
