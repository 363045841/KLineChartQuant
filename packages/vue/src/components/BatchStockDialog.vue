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
      <button class="batch-btn batch-btn--cancel" @click="emit('close')">取消</button>
      <button class="batch-btn batch-btn--confirm" @click="onApply">应用</button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
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
  background: var(--klc-color-background);
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

.batch-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 68px;
  height: 32px;
  padding: 0 14px;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s,
    box-shadow 0.15s,
    transform 0.15s;
  line-height: 1;
  white-space: nowrap;
}

.batch-btn--cancel {
  background: transparent;
  border-color: var(--klc-color-axis-line);
  color: var(--klc-color-axis-text);
}

.batch-btn--cancel:hover {
  background: var(--klc-color-tag-bg-hover);
  color: var(--klc-color-foreground);
  border-color: var(--klc-color-axis-text);
}

.batch-btn--confirm {
  background: var(--klc-color-foreground);
  border-color: var(--klc-color-foreground);
  color: var(--klc-color-background);
}

.batch-btn--confirm:hover {
  background: var(--klc-color-foreground);
  border-color: var(--klc-color-foreground);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
  transform: translateY(-1px);
}

.batch-btn--confirm:active {
  transform: translateY(0);
  box-shadow: none;
}
</style>
