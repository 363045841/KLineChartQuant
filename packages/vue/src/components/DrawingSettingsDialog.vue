<template>
  <BaseModal :show="show" title="图元设置" width="min(92vw, 440px)" @close="emit('close')">
    <template #tabs>
      <BaseTabs v-model="activeTab" :tabs="tabs" aria-label="图元设置" />
    </template>
    <div class="drawing-settings-body" role="tabpanel" :aria-label="activeTab === 'style' ? '样式' : '文字'">
      <template v-if="activeTab === 'style'">
        <label v-if="editableStyleKeys.includes('fill')" class="color-row">
          <span>背景颜色</span>
          <ColorInput
            :value="drawing.style.fill ?? drawing.style.stroke ?? DEFAULT_DRAWING_STROKE"
            aria-label="背景颜色"
            @change="emit('updateStyle', { fill: $event })"
          />
        </label>
        <label v-if="editableStyleKeys.includes('stroke')" class="color-row">
          <span>线条颜色</span>
          <ColorInput
            :value="drawing.style.stroke ?? DEFAULT_DRAWING_STROKE"
            aria-label="线条颜色"
            @change="emit('updateStyle', { stroke: $event })"
          />
        </label>
      </template>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
  import { DEFAULT_DRAWING_STROKE } from '@363045841yyt/klinechart-core'
  import type { DrawingObject, DrawingStyle } from '@363045841yyt/klinechart-core/controllers'
  import { ref, watch } from 'vue'

  import BaseModal from './BaseModal.vue'
  import BaseTabs from './BaseTabs.vue'
  import ColorInput from './ColorInput.vue'

  const props = defineProps<{
    show: boolean
    drawing: DrawingObject
    editableStyleKeys: ReadonlyArray<keyof DrawingStyle>
  }>()
  const emit = defineEmits<{
    close: []
    updateStyle: [style: Partial<DrawingStyle>]
  }>()
  const tabs = [
    { id: 'style', label: '样式' },
    { id: 'text', label: '文字' },
  ] as const
  const activeTab = ref<'style' | 'text'>('style')

  watch(() => props.show, (show) => {
    if (show) activeTab.value = 'style'
  })
</script>

<style scoped>
  .drawing-settings-body {
    min-height: 180px;
  }

  .color-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 8px 0;
    font-size: 13px;
    cursor: pointer;
  }

</style>
