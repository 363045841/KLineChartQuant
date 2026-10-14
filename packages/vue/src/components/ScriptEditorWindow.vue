<!-- 独立窗口中的脚本编辑器：工作区 + 返回标签页/保存，自身不再承载弹窗。 -->
<template>
  <div class="script-editor-window">
    <ScriptEditorWorkspace
      :source="source"
      :error="error"
      :detachable="false"
      @update:source="emit('update:source', $event)"
    />
    <div class="script-editor-window__footer">
      <BaseButton @click="emit('return')">返回标签页</BaseButton>
      <BaseButton variant="primary" :aria-label="saved ? '已保存' : '保存'" @click="emit('save')">
        <IconTablerCheck v-if="saved" class="script-editor-window__save-icon" aria-hidden="true" />
        <span v-else>保存</span>
      </BaseButton>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'

  import IconTablerCheck from '~icons/tabler/check'

  import { provideFullscreenTeleportTarget } from '../composables/useFullscreenTeleportTarget.js'
  import BaseButton from './BaseButton.vue'
  import ScriptEditorWorkspace from './ScriptEditorWorkspace.vue'

  const props = withDefaults(
    defineProps<{
      /** 当前脚本源码，变更通过 update:source 回传。 */
      source: string
      /** 宿主保存校验的错误；与语言服务的错误在工作区内合并展示。 */
      error?: string | null
      /** 最近一次保存是否成功；成功时确认按钮显示勾图标。 */
      saved?: boolean
      /** 新窗口的文档 body：内部浮层的 Teleport 目标。 */
      container: HTMLElement
    }>(),
    { error: null, saved: false },
  )

  const emit = defineEmits<{
    'update:source': [value: string]
    save: []
    /** 关闭本窗口并把编辑器交回标签页弹窗。 */
    return: []
  }>()

  // 浮层默认 Teleport 到 'body'，在独立窗口里会解析成主文档；这里改指向新窗口的文档。
  provideFullscreenTeleportTarget(computed(() => props.container))
</script>

<style scoped>
  /* 固定定位铺满窗口，不受新文档 <body> 默认外边距影响。 */
  .script-editor-window {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    background: var(--klc-color-ui-surface);
    color: var(--klc-color-ui-text);
  }

  /* 弹窗里的编辑区是固定高度，独立窗口里改为撑满可用空间；选择器带上工作区根类以稳定压过组件自身的固定高度规则。 */
  .script-editor-window :deep(.script-workspace) {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
  }

  .script-editor-window :deep(.script-workspace .script-editor) {
    flex: 1;
    height: auto;
    max-height: none;
    min-height: 0;
  }

  .script-editor-window__footer {
    --base-button-height: calc(var(--klc-density-default, 32px) - var(--klc-space-4, 4px));
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--klc-space-8, 8px);
    height: calc(var(--klc-density-default, 32px) + 2 * var(--klc-space-4, 4px));
    padding: 0 var(--klc-space-12, 12px);
    flex-shrink: 0;
  }

  .script-editor-window__save-icon {
    width: 16px;
    height: 16px;
  }
</style>
