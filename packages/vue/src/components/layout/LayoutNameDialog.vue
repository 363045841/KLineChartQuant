<!-- 布局命名弹窗：创建、重命名与复制共用，输入名称后提交。 -->
<template>
  <BaseModal
    :open="show"
    :title="title"
    size="xs"
    :close-on-overlay="!busy"
    :show-close="!busy"
    @update:open="!$event && emit('close')"
  >
    <form :id="formId" @submit.prevent="submit">
      <BaseField label="布局名称" :for-id="nameId" :error="error">
        <BaseInput
          :id="nameId"
          v-model="name"
          maxlength="40"
          autocomplete="off"
          :disabled="busy"
          autofocus
          @focus="selectOnOpen"
        />
      </BaseField>
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
  import BaseButton from '@vue-src/components/common/BaseButton.vue'
  import BaseField from '@vue-src/components/common/BaseField.vue'
  import BaseInput from '@vue-src/components/common/BaseInput.vue'
  import BaseModal from '@vue-src/components/common/BaseModal.vue'
  import { ref, useId, watch } from 'vue'

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
</style>
