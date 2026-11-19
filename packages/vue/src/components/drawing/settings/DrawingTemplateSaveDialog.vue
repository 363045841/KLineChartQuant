<!-- 保存图元模板弹窗：输入模板名并提交，字段样式沿用其他弹窗的通用输入约定。 -->
<template>
  <BaseModal
    :open="show"
    title="保存图元模板"
    size="xs"
    body="form"
    :dismiss="busy ? 'locked' : 'auto'"
    @update:open="!$event && emit('close')"
  >
    <form :id="formId" @submit.prevent="submit">
      <BaseField v-slot="{ controlAttrs }" label="模板名称" :error="error">
        <BaseInput
          v-bind="controlAttrs"
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
  import BaseButton from '@vue-src/components/common/button/BaseButton.vue'
  import BaseField from '@vue-src/components/common/form/BaseField.vue'
  import BaseInput from '@vue-src/components/common/form/BaseInput.vue'
  import BaseModal from '@vue-src/components/common/dialog/BaseModal.vue'
  import { ref, useId, watch } from 'vue'

  const props = defineProps<{ show: boolean; busy: boolean; error: string }>()
  const emit = defineEmits<{ close: []; save: [name: string] }>()
  const formId = useId()
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
