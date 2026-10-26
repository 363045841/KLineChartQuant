<!--
  脚本编辑器宿主：弹窗与独立窗口共用同一套工作区绑定，只切换外层壳。
  弹窗外壳提供 BaseModal，独立窗口外壳铺满页面；工作区、事件和 props 只写一份。
-->
<template>
  <component :is="shell" v-bind="shellProps">
    <div class="script-editor-host__body" :class="`script-editor-host__body--${mode}`">
      <ScriptEditorWorkspace
        :source="source"
        :tabs="tabs"
        :active-tab-id="activeTabId"
        @select-tab="emit('select-tab', $event)"
        @close-tab="emit('close-tab', $event)"
        :kind="kind"
        :documents="documents"
        :libraries="libraries"
        @create-script="emit('create-script', $event)"
        @open-script="emit('open-script', $event)"
        @refresh-documents="emit('refresh-documents')"
        :logs="logs"
        @clear-output="emit('clear-output')"
        :trusted="trusted"
        :identity="identity"
        :saving="saving"
        :saved="saved"
        :error="error"
        :detachable="mode === 'dialog' && detachable"
        :returnable="mode === 'window'"
        :theme="theme"
        @update:source="emit('update:source', $event)"
        @update:trusted="emit('update:trusted', $event)"
        @open-window="emit('open-window')"
        @create-copy="emit('create-copy')"
        @save="emit('save')"
        @return="emit('return')"
      />
    </div>
  </component>
</template>

<script setup lang="ts">
  import type { LogEvent } from '@363045841yyt/klinechart-plot-contracts'
  import BaseModal from '@vue-src/components/common/BaseModal.vue'
  import type { ScriptEditorDocument, ScriptEditorTab, ScriptIdentity } from '@vue-src/composables/chart/scriptEditor/types.js'
  import { provideFullscreenTeleportTarget } from '@vue-src/composables/ui/useFullscreenTeleportTarget.js'
  import { computed } from 'vue'
  import ScriptEditorWorkspace from './ScriptEditorWorkspace.vue'

  const props = withDefaults(
    defineProps<{
      /** 弹窗外壳或独立窗口外壳。 */
      mode?: 'dialog' | 'window'
      /** 弹窗开关；独立窗口不使用。 */
      open?: boolean
      /** 当前脚本源码，变更通过 update:source 回传。 */
      source: string
      tabs: readonly ScriptEditorTab[]
      activeTabId: string | null
      kind?: 'indicator' | 'library'
      documents?: readonly ScriptEditorDocument[]
      libraries?: readonly { name: string; source: string }[]
      logs?: readonly LogEvent[]
      trusted: boolean
      identity: ScriptIdentity
      saving?: boolean
      /** 最近一次保存是否成功。 */
      saved?: boolean
      /** 宿主保存校验的错误；与语言服务的错误在工作区内合并展示。 */
      error?: string | null
      /** 弹窗标题；独立窗口沿用页面标题。 */
      title?: string
      /** 弹窗是否提供「在新窗口打开」入口。 */
      detachable?: boolean
      /** 当前图表的有效主题，决定语法高亮配色。 */
      theme: 'light' | 'dark'
      /** 独立窗口的页面 body，供内部浮层 Teleport；弹窗模式不需要。 */
      container?: HTMLElement
    }>(),
    {
      mode: 'dialog',
      open: false,
      title: '编辑脚本',
      kind: 'indicator',
      documents: () => [],
      libraries: () => [],
      logs: () => [],
      error: null,
      detachable: false,
      saving: false,
      saved: false,
    },
  )

  const emit = defineEmits<{
    'select-tab': [id: string]
    'close-tab': [id: string]
    'create-script': [kind: 'indicator' | 'library']
    'open-script': [id: string]
    'refresh-documents': []
    'update:open': [value: boolean]
    'update:source': [value: string]
    'update:trusted': [value: boolean]
    save: []
    'open-window': []
    'create-copy': []
    'clear-output': []
    /** 关闭独立窗口并把编辑器交回标签页弹窗。 */
    return: []
  }>()

  // 独立窗口自己创建页面 body，显式提供给内部浮层；弹窗沿用父级或 BaseModal 的默认目标。
  if (props.mode === 'window') {
    provideFullscreenTeleportTarget(computed(() => props.container ?? document.body))
  }

  const shell = computed(() => (props.mode === 'dialog' ? BaseModal : 'div'))
  const shellProps = computed(() =>
    props.mode === 'dialog'
      ? {
          open: props.open,
          title: props.title,
          width: 'min(94vw, 1040px)',
          maxHeight: 'calc(100dvh - 48px)',
          bodyScrollable: false,
          bodyPadding: '0',
          'onUpdate:open': (value: boolean) => emit('update:open', value),
        }
      : { class: 'script-editor-window' },
  )
</script>

<style scoped>
  .script-editor-host__body {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  /* 弹窗内约束高度；独立窗口由页面 root 撑满。 */
  .script-editor-host__body--dialog {
    height: min(80dvh, 780px);
    max-height: calc(100dvh - 128px);
  }

  .script-editor-host__body--dialog :deep(.script-workspace) {
    flex: 1;
    min-height: 0;
    max-height: none;
  }

  .script-editor-host__body--dialog :deep(.script-editor) {
    flex: 1;
    height: auto;
    min-height: 0;
  }

  /* 固定定位铺满窗口，不受新文档 <body> 默认外边距影响。 */
  .script-editor-window {
    position: fixed;
    inset: 0;
    display: flex;
    background: var(--klc-color-ui-surface);
    color: var(--klc-color-ui-text);
  }

  .script-editor-host__body--window {
    flex: 1;
  }

  /* 独立窗口里工作区撑满可用空间；选择器带上根类以稳定压过组件自身固定高度规则。 */
  .script-editor-host__body--window :deep(.script-workspace) {
    max-height: none;
    display: flex;
    flex: 1;
    flex-direction: row;
    min-height: 0;
  }

  .script-editor-host__body--window :deep(.script-workspace .script-editor) {
    flex: 1;
    height: auto;
    max-height: none;
    min-height: 0;
  }
</style>
