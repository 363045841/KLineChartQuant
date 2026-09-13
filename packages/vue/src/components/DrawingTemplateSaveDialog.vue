<template>
  <BaseModal
    :show="show"
    :title="title"
    :z-index="10900"
    :close-on-overlay="!busy"
    :show-close="!busy"
    @close="emit('close')"
  >
    <div class="tpl-save">
      <input
        ref="inputRef"
        v-model="name"
        class="tpl-save__input"
        :placeholder="placeholder"
        :disabled="busy"
        @keydown.enter="confirm"
      />
      <p v-if="errorMessage" class="tpl-save__error">{{ errorMessage }}</p>
    </div>
    <template #footer>
      <button class="tpl-save__btn" :disabled="busy" @click="emit('close')">取消</button>
      <button
        class="tpl-save__btn tpl-save__btn--primary"
        :disabled="busy || !name.trim()"
        @click="confirm"
      >
        保存
      </button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import { nextTick, ref, watch } from 'vue'

  import BaseModal from './BaseModal.vue'

  const props = defineProps<{
    show: boolean
    title?: string
    placeholder?: string
    busy?: boolean
    errorMessage?: string
  }>()

  const emit = defineEmits<{
    (e: 'close'): void
    (e: 'confirm', name: string): void
  }>()

  const name = ref('')
  const inputRef = ref<HTMLInputElement | null>(null)

  watch(
    () => props.show,
    (visible) => {
      if (visible) {
        name.value = ''
        void nextTick(() => inputRef.value?.focus())
      }
    },
  )

  function confirm() {
    const trimmed = name.value.trim()
    if (!trimmed || props.busy) return
    emit('confirm', trimmed)
  }
</script>

<style scoped>
  .tpl-save {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 260px;
  }

  .tpl-save__input {
    width: 100%;
    padding: 6px 10px;
    border: 1px solid var(--klc-color-border, #444);
    border-radius: 6px;
    background: var(--klc-color-bg, #1e222d);
    color: var(--klc-color-text-primary, #d1d4dc);
    font-size: 12px;
    outline: none;
  }

  .tpl-save__input:focus {
    border-color: var(--klc-color-active, #2962ff);
  }

  .tpl-save__error {
    margin: 0;
    font-size: 11px;
    color: #ef5350;
  }

  .tpl-save__btn {
    padding: 5px 14px;
    border: 1px solid var(--klc-color-border, #444);
    border-radius: 6px;
    background: transparent;
    color: var(--klc-color-text-secondary, #787b86);
    font-size: 12px;
    cursor: pointer;
  }

  .tpl-save__btn:hover:not(:disabled) {
    color: var(--klc-color-text-primary, #d1d4dc);
  }

  .tpl-save__btn--primary {
    background: var(--klc-color-active, #2962ff);
    border-color: var(--klc-color-active, #2962ff);
    color: #fff;
  }

  .tpl-save__btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
