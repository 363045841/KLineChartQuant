<!-- 指标模板名称弹窗：保存与重命名共用，名称校验与预填逻辑只实现一次。 -->
<template>
  <BaseModal
    :open="show"
    :title="title"
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
      <div v-if="labels !== null" class="template-name__summary">
        <span class="template-name__summary-title">已存指标</span>
        <p v-if="labels.length === 0" class="template-name__empty">当前图表没有指标</p>
        <p v-else class="template-name__labels">{{ labels.join('，') }}</p>
      </div>
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
    /** 弹窗标题，保存与重命名分别传入。 */
    title: string
    /** 打开时预填的名称；保存时为空串。 */
    initialName: string
    /** 保存时展示的指标摘要；重命名传 null 表示不展示。 */
    labels: ReadonlyArray<string> | null
    busy: boolean
    error: string
  }>()
  const emit = defineEmits<{ close: []; submit: [name: string] }>()

  const formId = useId()
  const nameId = `${formId}-name`
  const name = ref('')
  // 只在弹窗打开时选中预填文本，之后用户点入输入框可正常定位光标。
  let selectPending = false

  /** 打开时用调用方给的值预填，并允许首次聚焦全选以便直接替换。 */
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

  .template-name__summary {
    display: flex;
    flex-direction: column;
    gap: var(--klc-space-4, 4px);
    margin-top: var(--klc-space-8, 8px);
    padding-top: var(--klc-space-8, 8px);
    border-top: 1px solid var(--klc-color-ui-border);
  }

  .template-name__summary-title {
    font-size: var(--klc-font-size-sm, 12px);
    color: var(--klc-color-ui-text-secondary);
  }

  .template-name__labels,
  .template-name__empty {
    margin: 0;
    font-size: var(--klc-font-size-sm, 12px);
    color: var(--klc-color-ui-text);
    word-break: break-word;
  }

  .template-name__empty {
    color: var(--klc-color-ui-text-secondary);
  }

  .template-name__error {
    font-size: var(--klc-font-size-sm, 12px);
    color: var(--klc-color-danger, #e04a4a);
  }
</style>
