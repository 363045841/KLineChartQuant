<template>
  <BaseModal
    title="批量设置股票代码"
    :open="show"
    @update:open="!$event && emit('close')"
  >
    <BaseField
      v-slot="{ hintId }"
      label="股票代码"
      hint="每行一个代码；导出时会把所选区间内这些品种的数据一并导出。"
    >
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
    </BaseField>
    <template #footer>
      <BaseButton @click="emit('close')">取消</BaseButton>
      <BaseButton :disabled="codes.length === 0" @click="onApply">应用</BaseButton>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import BaseButton from '@vue-src/components/common/BaseButton.vue'
  import BaseField from '@vue-src/components/common/BaseField.vue'
  import BaseModal from '@vue-src/components/common/BaseModal.vue'
  import BaseTextarea from '@vue-src/components/common/BaseTextarea.vue'
  import { computed, ref } from 'vue'

  defineProps<{
    show: boolean
  }>()

  const emit = defineEmits<{
    close: []
    apply: [codes: string[]]
  }>()

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
  .batch-textarea {
    font-family: var(--klc-text-11-mono-font-family, ui-monospace, monospace);
    font-variant-numeric: tabular-nums;
  }
</style>
