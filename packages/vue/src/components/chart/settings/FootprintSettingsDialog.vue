<!-- 足迹图独立设置弹窗：复用设置行外观，以草稿提供确定、取消与局部重置。 -->
<template>
  <BaseModal
    :open="open"
    title="足迹图设置"
    width="min(92vw, 400px)"
    footer-align="space-between"
    @update:open="emit('update:open', $event)"
  >
    <div class="settings-body">
      <SettingsItemRow
        v-for="item in items"
        :key="item.key"
        :label="item.label"
        :type="item.type"
        :value="settings[item.key]"
        :options="item.options"
        :min="item.min"
        :max="item.max"
        :step="item.step"
        @update="settings[item.key] = $event"
      />
    </div>
    <template #footer>
      <BaseButton @click="reset">重置</BaseButton>
      <div class="footer-right">
        <BaseButton @click="emit('update:open', false)">取消</BaseButton>
        <BaseButton @click="emit('confirm', snapshot())">确定</BaseButton>
      </div>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import type { ChartSettings } from '@363045841yyt/klinechart-core/config'
  import BaseButton from '@vue-src/components/common/BaseButton.vue'
  import BaseModal from '@vue-src/components/common/BaseModal.vue'
  import { useFootprintSettings } from '@vue-src/composables/chart/useFootprintSettings.js'
  import SettingsItemRow from './SettingsItemRow.vue'

  const props = defineProps<{ open: boolean; initialSettings: ChartSettings }>()
  const emit = defineEmits<{
    'update:open': [value: boolean]
    confirm: [settings: ChartSettings]
  }>()
  const { settings, items, reset, snapshot } = useFootprintSettings(
    () => props.open,
    () => props.initialSettings,
  )
</script>

<style scoped src="../../common/settings-item.css"></style>
