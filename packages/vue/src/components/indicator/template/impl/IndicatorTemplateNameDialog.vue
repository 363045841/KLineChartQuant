<!-- 指标模板重命名弹窗：只改名称，模板内容保持不变。 -->
<template>
  <BaseModal
    :open="show"
    title="重命名模板"
    width="min(92vw, 360px)"
    :close-on-overlay="!busy"
    :show-close="!busy"
    @update:open="!$event && emit('close')"
  >
    <form :id="formId" class="template-name" @submit.prevent="submit">
      <label class="template-name__label" :for="nameId">模板名称</label>
      <input
        :id="nameId"
        v-model="name"
        class="form-control"
        type="text"
        maxlength="40"
        autocomplete="off"
        :disabled="busy"
        autofocus
        @focus="selectOnOpen"
      />
      <span v-if="error" class="template-name__error" role="alert">{{ error }}</span>
    </form>
    <template #footer>
      <BaseButton :disabled="busy" @click="emit('close')">取消</BaseButton>
      <BaseButton type="submit" :form="formId" :disabled="!name.trim() || busy">保存</BaseButton>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import BaseButton from '@vue-src/components/common/BaseButton.vue'
  import BaseModal from '@vue-src/components/common/BaseModal.vue'
  import { ref, useId, watch } from 'vue'

  const props = defineProps<{
    show: boolean
    initialName: string
    busy: boolean
    error: string
  }>()
  const emit = defineEmits<{ close: []; submit: [name: string] }>()

  const formId = useId()
  const nameId = `${formId}-name`
  const name = ref('')
  // 只在弹窗打开时选中预填文本，之后用户点入输入框可正常定位光标。
  let selectPending = false

  /** 打开时用现有名称预填，并允许首次聚焦全选以便直接替换。 */
  watch(
    () => props.show,
    (visible) => {
      if (!visible) return
      name.value = props.initialName
      selectPending = true
    },
  )

  /** 首次聚焦时全选预填名称。 */
  function selectOnOpen(event: FocusEvent): void {
    if (!selectPending || !(event.target instanceof HTMLInputElement)) return
    selectPending = false
    event.target.select()
  }

  /** 提交名称；空名称由按钮禁用与父级校验双重拦下。 */
  function submit(): void {
    const value = name.value.trim()
    if (!value || props.busy) return
    emit('submit', value)
  }
</script>

<style scoped>
  .template-name {
    display: flex;
    flex-direction: column;
    gap: var(--klc-space-8, 8px);
  }

  .template-name__label {
    font-size: var(--klc-font-size-sm, 12px);
    color: var(--klc-color-ui-text-secondary);
  }

  .template-name__error {
    font-size: var(--klc-font-size-sm, 12px);
    color: var(--klc-color-danger, #e04a4a);
  }
</style>
