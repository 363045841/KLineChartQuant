<template>
  <BaseModal
    :show="show"
    title="保存图元模板"
    width="min(92vw, 360px)"
    :close-on-overlay="!busy"
    :show-close="!busy"
    @close="emit('close')"
  >
    <form :id="formId" class="template-form" @submit.prevent="submit">
      <label :for="`${formId}-name`">模板名称</label>
      <input :id="`${formId}-name`" v-model.trim="name" type="text" maxlength="40" autocomplete="off" :disabled="busy" autofocus />
      <span v-if="error" class="template-error" role="alert">{{ error }}</span>
    </form>
    <template #footer>
      <BaseButton :disabled="busy" @click="emit('close')">取消</BaseButton>
      <BaseButton type="submit" :form="formId" :disabled="!name || busy">保存</BaseButton>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import { ref, useId, watch } from 'vue'

  import BaseButton from '../BaseButton.vue'
  import BaseModal from '../BaseModal.vue'

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
  .template-form {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .template-form input {
    padding: 6px;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 4px;
    background: var(--klc-color-ui-input);
    color: var(--klc-color-ui-text);
  }

  .template-error {
    color: var(--klc-color-ui-danger-text);
    font-size: 12px;
  }
</style>
