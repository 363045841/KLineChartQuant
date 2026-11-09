<!-- 指标模板保存弹窗：输入名称并展示本次将保存的指标摘要。 -->
<template>
  <BaseModal
    :open="show"
    title="保存指标模板"
    width="min(92vw, 380px)"
    :close-on-overlay="!busy"
    :show-close="!busy"
    @update:open="!$event && emit('close')"
  >
    <form :id="formId" class="template-save" @submit.prevent="submit">
      <label class="template-save__label" :for="nameId">模板名称</label>
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
      <div class="template-save__summary">
        <span class="template-save__summary-title">已存指标</span>
        <p v-if="labels.length === 0" class="template-save__empty">当前图表没有指标</p>
        <p v-else class="template-save__labels">{{ labels.join('，') }}</p>
      </div>
      <span v-if="error" class="template-save__error" role="alert">{{ error }}</span>
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
    /** 本次将保存的指标摘要，由当前图表快照派生。 */
    labels: ReadonlyArray<string>
    /** 名称冲突时是否覆盖；用于给出提示文案。 */
    busy: boolean
    error: string
  }>()
  const emit = defineEmits<{ close: []; submit: [name: string] }>()

  const formId = useId()
  const nameId = `${formId}-name`
  const name = ref('')
  // 只在弹窗打开时选中预填文本，之后用户点入输入框可正常定位光标。
  let selectPending = false

  /** 打开时清空名称并允许首次聚焦全选。 */
  watch(
    () => props.show,
    (visible) => {
      if (!visible) return
      name.value = ''
      selectPending = true
    },
  )

  /** 首次聚焦时全选名称，方便直接输入。 */
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
  .template-save {
    display: flex;
    flex-direction: column;
    gap: var(--klc-space-8, 8px);
  }

  .template-save__label {
    font-size: var(--klc-font-size-sm, 12px);
    color: var(--klc-color-ui-text-secondary);
  }

  .template-save__summary {
    display: flex;
    flex-direction: column;
    gap: var(--klc-space-4, 4px);
    margin-top: var(--klc-space-8, 8px);
    padding-top: var(--klc-space-8, 8px);
    border-top: 1px solid var(--klc-color-ui-border);
  }

  .template-save__summary-title {
    font-size: var(--klc-font-size-sm, 12px);
    color: var(--klc-color-ui-text-secondary);
  }

  .template-save__labels,
  .template-save__empty {
    margin: 0;
    font-size: var(--klc-font-size-sm, 12px);
    color: var(--klc-color-ui-text);
    word-break: break-word;
  }

  .template-save__empty {
    color: var(--klc-color-ui-text-secondary);
  }

  .template-save__error {
    font-size: var(--klc-font-size-sm, 12px);
    color: var(--klc-color-danger, #e04a4a);
  }
</style>
