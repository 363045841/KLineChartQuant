<!-- 保存图元模板弹窗：输入模板名并提交，字段样式沿用其他弹窗的通用输入约定。 -->
<template>
  <BaseModal
    :show="show"
    title="保存图元模板"
    width="min(92vw, 360px)"
    :close-on-overlay="!busy"
    :show-close="!busy"
    @close="emit('close')"
  >
    <form :id="formId" class="template-field" @submit.prevent="submit">
      <label class="template-field__label" :for="nameId">模板名称</label>
      <input
        class="form-control"
        :id="nameId"
        v-model.trim="name"
        type="text"
        maxlength="40"
        autocomplete="off"
        :disabled="busy"
        autofocus
      />
      <span v-if="error" class="template-field__error" role="alert">{{ error }}</span>
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

<style scoped src="../common/form-control.css"></style>

<style scoped>
  /* 通用弹窗输入字段：标签在上、控件在下，样式与其他弹窗一致。 */
  .template-field {
    display: grid;
    gap: 5px;
  }

  .template-field__label {
    color: var(--klc-color-ui-muted);
    font-size: 11px;
    font-weight: 500;
  }

  .template-field__error {
    color: var(--klc-color-ui-danger-text);
    font-size: 11px;
  }
</style>
