<!-- 脚本编辑器对话框：BaseModal + 工作区，只编辑文本，不执行脚本。 -->
<template>
  <BaseModal
    :open="open"
    :title="title"
    width="min(92vw, 880px)"
    :body-scrollable="false"
    body-padding="0"
    @update:open="emit('update:open', $event)"
  >
    <ScriptEditorWorkspace
      :source="source"
      :error="error"
      :detachable="detachable"
      @update:source="emit('update:source', $event)"
      @open-window="emit('open-window')"
    />
    <template #footer>
      <BaseButton @click="emit('update:open', false)">关闭</BaseButton>
      <BaseButton variant="primary" :aria-label="saved ? '已保存' : '保存'" @click="emit('save')">
        <IconTablerCheck v-if="saved" class="script-save-icon" aria-hidden="true" />
        <span v-else>保存</span>
      </BaseButton>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import IconTablerCheck from '~icons/tabler/check'

  import BaseButton from './BaseButton.vue'
  import BaseModal from './BaseModal.vue'
  import ScriptEditorWorkspace from './ScriptEditorWorkspace.vue'

  withDefaults(
    defineProps<{
      /** 由父组件控制的开关状态。 */
      open: boolean
      /** 当前脚本源码，变更通过 update:source 回传。 */
      source: string
      /** 完整脚本保存校验的错误，由宿主返回。 */
      error?: string | null
      /** 最近一次保存是否成功；成功时确认按钮显示勾图标。 */
      saved?: boolean
      /** 对话框标题。 */
      title?: string
      /** 是否提供「在新窗口打开」入口。 */
      detachable?: boolean
    }>(),
    { title: '编辑脚本', saved: false, error: null, detachable: false },
  )

  const emit = defineEmits<{
    'update:open': [value: boolean]
    'update:source': [value: string]
    save: []
    'open-window': []
  }>()
</script>

<style scoped>
  .script-save-icon {
    width: 16px;
    height: 16px;
  }
</style>
