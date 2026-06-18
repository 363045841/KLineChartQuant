<template>
  <BaseModal
    title="导出数据"
    :show="!!progress"
    :z-index="1100"
    :close-on-overlay="false"
    footer-align="center"
    @close="emit('close')"
  >
    <div class="export-body">
      <div class="export-label">{{ progress?.label }}</div>
      <div class="export-bar-track">
        <div class="export-bar-fill" :style="{ width: pct + '%' }" />
      </div>
      <div class="export-counter">{{ progress?.current ?? 0 }} / {{ progress?.total ?? 0 }}</div>
    </div>
    <template #footer>
      <button
        v-if="progress && progress.current === progress.total"
        class="export-done-btn"
        @click="emit('close')"
      >
        完成
      </button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import BaseModal from './BaseModal.vue'

const props = defineProps<{
  progress: { current: number; total: number; label: string } | null
}>()

const emit = defineEmits<{
  close: []
}>()

const pct = computed(() => {
  if (!props.progress || props.progress.total <= 0) return 0
  return Math.min(100, Math.round((props.progress.current / props.progress.total) * 100))
})
</script>

<style scoped>
.export-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.export-label {
  font-size: 13px;
  color: var(--klc-color-axis-text);
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.export-bar-track {
  width: 100%;
  height: 6px;
  background: var(--klc-color-grid-major);
  border-radius: 999px;
  overflow: hidden;
}

.export-bar-fill {
  height: 100%;
  background: var(--klc-color-foreground);
  border-radius: 999px;
  transition: width 0.25s ease;
}

.export-counter {
  font-size: 12px;
  color: var(--klc-color-axis-text);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.export-done-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  padding: 0 20px;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  background: var(--klc-color-foreground);
  border-color: var(--klc-color-foreground);
  color: var(--klc-color-background);
  transition:
    background 0.15s,
    box-shadow 0.15s,
    transform 0.15s;
  line-height: 1;
  white-space: nowrap;
}

.export-done-btn:hover {
  background: var(--klc-color-foreground);
  border-color: var(--klc-color-foreground);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
  transform: translateY(-1px);
}

.export-done-btn:active {
  transform: translateY(0);
  box-shadow: none;
}
</style>
