<template>
  <BaseModal title="批量设置股票代码" :show="show" @close="emit('close')">
    <textarea
      v-model="codesText"
      class="batch-textarea"
      placeholder="每行一个股票代码，导出时会将所选区间内这些品种的数据一并导出&#10;例如:&#10;000001&#10;600036&#10;002415"
      rows="8"
      spellcheck="false"
    />
    <template #footer>
      <BaseButton @click="emit('close')">取消</BaseButton>
      <BaseButton @click="onApply">应用</BaseButton>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import { ref, computed } from 'vue'

  import BaseButton from './BaseButton.vue'
  import BaseModal from './BaseModal.vue'

  const props = defineProps<{
    show: boolean
  }>()

  const emit = defineEmits<{
    close: []
    apply: [codes: string[]]
  }>()

  const codes = ref<string[]>([])

  const codesText = computed({
    get: () => codes.value.join('\n'),
    set: (val: string) => {
      codes.value = val
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
    },
  })

  function onApply() {
    if (codes.value.length === 0) return
    emit('apply', codes.value)
    emit('close')
  }
</script>

<style scoped>
  .batch-textarea {
    width: 100%;
    min-height: 160px;
    max-height: 100%;
    padding: 10px 12px;
    border: 1px solid var(--klc-color-border-button);
    border-radius: 6px;
    background: var(--klc-color-ui-control-background);
    color: var(--klc-color-foreground);
    font-size: 13px;
    font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
    line-height: 1.5;
    resize: vertical;
    outline: none;
    transition: border-color 0.15s;
    box-sizing: border-box;
  }

  .batch-textarea:focus {
    border-color: var(--klc-color-axis-text);
  }

  .batch-textarea::placeholder {
    color: var(--klc-color-axis-text);
    opacity: 0.5;
  }
</style>
