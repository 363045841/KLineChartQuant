<template>
  <CanvasToolbar>
    <DrawingStyleControls
      :drawings="drawings"
      :editable-style-keys="editableStyleKeys"
      @update-style="emit('updateStyle', $event)"
    />

    <span v-if="drawings.length > 1" class="selection-count">已选 {{ drawings.length }}</span>

    <div
      v-if="lineLabelPosition"
      class="label-position"
      :class="{ 'toolbar-separated': drawings.length > 0 }"
      role="group"
      aria-label="文本位置"
    >
      <BaseTooltip
        v-for="option in positionOptions"
        :key="option.value"
        :content="option.label"
        placement="top"
        trigger-display="contents"
      >
        <button
          type="button"
          class="toolbar-btn label-position__button"
          :class="{ 'is-active': lineLabelPosition === option.value }"
          :aria-label="option.label"
          :aria-pressed="lineLabelPosition === option.value"
          @mousedown.prevent
          @click="emit('updateLineLabelPosition', option.value)"
        >
          <component :is="option.icon" aria-hidden="true" />
        </button>
      </BaseTooltip>
    </div>

    <DrawingTemplateMenu
      v-if="drawings.length > 0"
      label="模板"
      :names="templateNames ?? []"
      :message="templateError"
      :can-save="drawings.length === 1 && canUseTemplates"
      :can-apply="canUseTemplates"
      :saved-name="templateSaved"
      :disabled="false"
      :show-save="drawings.length === 1"
      trigger-class="toolbar-btn toolbar-btn--template"
      @open="emit('openTemplates')"
      @save-new="emit('saveTemplate')"
      @apply="emit('applyTemplate', $event)"
      @save-existing="emit('saveExistingTemplate', $event)"
      @remove="emit('deleteTemplate', $event)"
    >
      <template #trigger><IconTablerBookmarks class="toolbar-icon" aria-hidden="true" /></template>
    </DrawingTemplateMenu>

    <BaseTooltip v-if="drawings.length === 1" content="图元设置" placement="top" trigger-display="contents">
      <button
        type="button"
        class="toolbar-btn toolbar-btn--settings"
        aria-label="图元设置"
        @click="emit('openSettings', drawings[0]!.id)"
      >
        <IconTablerSettings class="settings-icon" aria-hidden="true" />
      </button>
    </BaseTooltip>

    <DrawingSelectionActions
      v-if="drawings.length > 0"
      :drawings="drawings"
      @copy="emit('copy')"
      @clone="emit('clone')"
      @hide="emit('hide')"
      @toggle-lock="emit('toggleLock', $event)"
      @delete="emit('delete')"
    />
  </CanvasToolbar>
</template>

<script setup lang="ts">
  import type {
    DrawingLabelPosition,
    DrawingObject,
    DrawingStyle,
  } from '@363045841yyt/klinechart-core/controllers'
  import BaseTooltip from '@vue-src/components/common/BaseTooltip.vue'
  import CanvasToolbar from '@vue-src/components/common/CanvasToolbar.vue'
  import { onMounted, onUnmounted } from 'vue'
  import IconTablerAlignCenter from '~icons/tabler/align-center'
  import IconTablerAlignLeft from '~icons/tabler/align-left'
  import IconTablerAlignRight from '~icons/tabler/align-right'
  import IconTablerBookmarks from '~icons/tabler/bookmarks'
  import IconTablerSettings from '~icons/tabler/settings'
  import DrawingSelectionActions from './DrawingSelectionActions.vue'
  import DrawingStyleControls from './DrawingStyleControls.vue'
  import DrawingTemplateMenu from './DrawingTemplateMenu.vue'

  const positionOptions = [
    { value: 'start', label: '起点', icon: IconTablerAlignLeft },
    { value: 'center', label: '居中', icon: IconTablerAlignCenter },
    { value: 'end', label: '终点', icon: IconTablerAlignRight },
  ] as const

  const props = withDefaults(
    defineProps<{
      drawings: ReadonlyArray<DrawingObject>
      editableStyleKeys: ReadonlyArray<keyof DrawingStyle>
      lineLabelPosition?: DrawingLabelPosition
      templateNames?: ReadonlyArray<string>
      templateError?: string
      templateSaved?: string | null
      canUseTemplates?: boolean
    }>(),
    { canUseTemplates: true },
  )

  const emit = defineEmits<{
    (e: 'updateStyle', style: Partial<DrawingStyle>): void
    (e: 'delete'): void
    (e: 'toggleLock', locked: boolean): void
    (e: 'hide'): void
    (e: 'copy'): void
    (e: 'clone'): void
    (e: 'updateLineLabelPosition', position: DrawingLabelPosition): void
    (e: 'openSettings', drawingId: string): void
    (e: 'openTemplates'): void
    (e: 'saveTemplate'): void
    (e: 'applyTemplate', name: string): void
    (e: 'deleteTemplate', name: string): void
    (e: 'saveExistingTemplate', name: string): void
  }>()

  function onKeyDown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    if (e.key === 'Delete') {
      e.preventDefault()
      emit('delete')
    }
  }

  onMounted(() => document.addEventListener('keydown', onKeyDown))
  onUnmounted(() => document.removeEventListener('keydown', onKeyDown))
</script>

<style scoped>
  .selection-count {
    padding: 0 4px;
    color: var(--klc-color-ui-text-soft);
    font-size: 12px;
    white-space: nowrap;
  }

  .label-position {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .label-position .toolbar-btn.label-position__button {
    flex: 0 0 26px;
    width: 26px;
    padding: 0;
    box-sizing: border-box;
  }

  .label-position__button :deep(svg) {
    flex: none;
    width: 18px;
    height: 18px;
  }

  .label-position__button.is-active {
    color: var(--klc-color-ui-accent);
    background: color-mix(in srgb, var(--klc-color-ui-accent) 16%, transparent);
  }
</style>
