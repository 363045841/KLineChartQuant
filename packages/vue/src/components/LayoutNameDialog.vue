<!-- 布局命名弹窗：创建、重命名与复制共用，输入名称后提交。 -->
<template>
  <BaseModal
    :show="show"
    :title="title"
    width="min(92vw, 360px)"
    :close-on-overlay="!busy"
    :show-close="!busy"
    @close="emit('close')"
  >
    <form :id="formId" class="layout-name" @submit.prevent="submit">
      <label class="layout-name__label" :for="nameId">布局名称</label>
      <input
        :id="nameId"
        v-model="name"
        type="text"
        maxlength="40"
        autocomplete="off"
        :disabled="busy"
        autofocus
        @focus="selectOnOpen"
      />
      <span v-if="error" class="layout-name__error" role="alert">{{ error }}</span>
    </form>
    <template #footer>
      <BaseButton :disabled="busy" @click="emit('close')">取消</BaseButton>
      <BaseButton type="submit" :form="formId" :disabled="!name.trim() || busy">
        {{ confirmLabel }}
      </BaseButton>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import { ref, useId, watch } from 'vue'

  import BaseButton from './BaseButton.vue'
  import BaseModal from './BaseModal.vue'

  const props = defineProps<{
    show: boolean
    title: string
    confirmLabel: string
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

  /** 打开时用传入名称预填，并允许首次聚焦全选以便直接替换。 */
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

  /** 提交有效名称；空值或忙碌时不动作。 */
  function submit(): void {
    if (name.value.trim() && !props.busy) emit('submit', name.value.trim())
  }
</script>

<style scoped>
  /* 通用弹窗输入字段：标签在上、控件在下，样式与其他弹窗一致。 */
  .layout-name {
    display: grid;
    gap: 5px;
  }

  .layout-name__label {
    color: var(--klc-color-ui-muted);
    font-size: 11px;
    font-weight: 500;
  }

  .layout-name input {
    width: 100%;
    height: 34px;
    box-sizing: border-box;
    padding: 0 10px;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 8px;
    outline: none;
    color: var(--klc-color-ui-text);
    background: var(--klc-color-ui-input);
    font: inherit;
    font-size: 12px;
    transition:
      background-color 0.2s ease,
      border-color 0.2s ease,
      box-shadow 0.2s ease;
  }

  .layout-name input:disabled {
    color: var(--klc-color-ui-muted);
    background: transparent;
    cursor: not-allowed;
  }

  .layout-name__error {
    color: var(--klc-color-ui-danger-text);
    font-size: 11px;
  }
</style>
