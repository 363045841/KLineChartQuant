<!-- 保存图元模板弹窗：输入模板名并提交，字段样式沿用其他弹窗的通用输入约定。 -->
<template>
  <BaseModal
    :open="show"
    title="保存图元模板"
    size="xs"
    :close-on-overlay="!busy"
    :show-close="!busy"
    @update:open="!$event && emit('close')"
  >
    <form :id="formId" @submit.prevent="submit">
      <BaseField label="模板名称" :for-id="nameId" :error="error">
        <BaseInput
          :id="nameId"
          v-model="name"
          maxlength="40"
          autocomplete="off"
          :disabled="busy"
          autofocus
        />
      </BaseField>
    </form>
    <template #footer>
      <BaseButton :disabled="busy" @click="emit('close')">取消</BaseButton>
      <BaseButton type="submit" :form="formId" :disabled="!name.trim() || busy">保存</BaseButton>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import BaseButton from '@vue-src/components/common/BaseButton.vue'
  import BaseField from '@vue-src/components/common/BaseField.vue'
  import BaseInput from '@vue-src/components/common/BaseInput.vue'
  import BaseModal from '@vue-src/components/common/BaseModal.vue'
  import { ref, useId, watch } from 'vue'

  const props = defineProps<{ show: boolean; busy: boolean; error: string }>()
  const emit = defineEmits<{ close: []; save: [name: string] }>()
  const formId = useId()
  const nameId = `${formId}-name`
  const name = ref('')
  watch(
    () => props.show,
    (visible) => {
      if (visible) name.value = ''
    },
  )
  function submit() {
    if (name.value.trim() && !props.busy) emit('save', name.value.trim())
  }
</script>

<style scoped>
</style>
