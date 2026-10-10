<template>
  <BaseModal title="批量设置股票代码" :show="show" @close="emit('close')">
    <label class="batch-field">
      <span class="batch-field__label">股票代码</span>
      <BaseTextarea
        v-model="codesText"
        class="batch-textarea"
        :min-rows="6"
        :max-rows="14"
        placeholder="000001&#10;600036&#10;002415…"
        spellcheck="false"
        autocomplete="off"
        :aria-describedby="hintId"
      />
      <span :id="hintId" class="batch-field__hint">
        每行一个代码；导出时会把所选区间内这些品种的数据一并导出。
      </span>
    </label>
    <template #footer>
      <BaseButton @click="emit('close')">取消</BaseButton>
      <BaseButton :disabled="codes.length === 0" @click="onApply">应用</BaseButton>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import { computed, ref, useId } from 'vue'

  import BaseButton from './BaseButton.vue'
  import BaseModal from './BaseModal.vue'
  import BaseTextarea from './common/BaseTextarea.vue'

  defineProps<{
    show: boolean
  }>()

  const emit = defineEmits<{
    close: []
    apply: [codes: string[]]
  }>()

  const hintId = `batch-codes-hint-${useId()}`
  /** 保留原始输入（含空行），否则回车产生的空行会被立即过滤，无法换行。 */
  const codesText = ref('')
  const codes = computed(() =>
    codesText.value
      .split('\n')
      .map((code) => code.trim())
      .filter(Boolean),
  )

  function onApply() {
    if (codes.value.length === 0) return
    emit('apply', codes.value)
    emit('close')
  }
</script>

<style scoped>
  .batch-field {
    display: flex;
    flex-direction: column;
    gap: var(--klc-space-8, 8px);
  }

  .batch-field__label {
    color: var(--klc-color-ui-text);
    font-size: var(--klc-text-label-13-font-size, 13px);
    font-weight: var(--klc-text-label-13-font-weight, 500);
  }

  .batch-field__hint {
    color: var(--klc-color-ui-muted);
    font-size: var(--klc-text-12-font-size, 12px);
    line-height: var(--klc-text-12-line-height, 16px);
  }

  .batch-textarea {
    font-family: var(--klc-text-11-mono-font-family, ui-monospace, monospace);
    font-variant-numeric: tabular-nums;
  }
</style>
