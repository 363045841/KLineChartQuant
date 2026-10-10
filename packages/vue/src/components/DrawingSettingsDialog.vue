<template>
  <BaseModal :show="show" title="图元设置" width="min(92vw, 440px)" @close="emit('close')">
    <template #tabs>
      <BaseTabs v-model="activeTab" :tabs="tabs" aria-label="图元设置" />
    </template>
    <div class="drawing-settings-body" role="tabpanel" :aria-label="activeTab === 'style' ? '样式' : '文本'">
      <template v-if="activeTab === 'style'">
        <div v-for="field in visibleStyleFields" :key="field" class="color-row">
          <span>{{ drawingColorFields[field].label }}</span>
          <ColorPicker
            :model-value="drawingColorValue(field)"
            :label="drawingColorFields[field].label"
            @update:model-value="emit('updateStyle', { [field]: $event })"
          />
        </div>
      </template>
      <div v-else-if="textTarget" class="text-settings">
        <label class="text-row">
          <span>文本</span>
          <BaseTextarea
            v-model="textDraft"
            class="text-row__field"
            :min-rows="3"
            :max-rows="8"
            maxlength="200"
            aria-label="图元文本"
            @change="updateText"
          />
        </label>
        <div class="text-alignment">
          <span>位置</span>
          <div class="text-alignment__options" role="group" aria-label="文本位置">
            <BaseTooltip
              v-for="option in alignmentOptions"
              :key="option.position"
              :content="option.label"
              placement="top"
              trigger-display="contents"
            >
              <button
                type="button"
                :aria-label="option.label"
                :aria-pressed="textPosition === option.position"
                :class="{ 'is-active': textPosition === option.position }"
                @click="setTextPosition(option.position)"
              >
                <component :is="option.icon" aria-hidden="true" />
              </button>
            </BaseTooltip>
          </div>
        </div>
      </div>
    </div>
    <template #footer>
      <div class="template-actions">
        <BaseButton size="sm" :disabled="busy" @click="openSaveTemplate">保存为模板</BaseButton>
        <DrawingTemplateMenu
          v-if="show"
          label="应用模板"
          trigger-class="drawing-template-menu-trigger"
          :names="templateNames"
          :can-save="true"
          :can-apply="templateFields.length > 0"
          :saved-name="savedName"
          :disabled="busy || templates.length === 0"
          @open="reloadTemplates"
          @apply="applyTemplate"
          @save-existing="saveExistingTemplate"
          @remove="deleteTemplate"
        >
        </DrawingTemplateMenu>
        <span v-if="templateError && !savingTemplate" role="alert">{{ templateError }}</span>
      </div>
    </template>
  </BaseModal>
  <DrawingTemplateSaveDialog
    :show="savingTemplate && show"
    :busy="busy"
    :error="templateError"
    @close="savingTemplate = false"
    @save="saveTemplate"
  />
</template>

<script setup lang="ts">
  import { DEFAULT_DRAWING_STROKE } from '@363045841yyt/klinechart-core'
  import type {
    DrawingLabelPosition,
    DrawingObject,
    DrawingStyle,
  } from '@363045841yyt/klinechart-core/controllers'
  import {
    captureDrawingTemplate,
    resolveTemplateLabel,
    resolveTemplateStyle,
    templateStyleFields,
  } from '@363045841yyt/klinechart-core/engine/drawing'
  import { computed, onMounted, ref, watch } from 'vue'
  import IconTablerAlignCenter from '~icons/tabler/align-center'
  import IconTablerAlignLeft from '~icons/tabler/align-left'
  import IconTablerAlignRight from '~icons/tabler/align-right'

  import { useDrawingTemplates } from '../composables/chart/useDrawingTemplates.js'
  import BaseButton from './BaseButton.vue'
  import BaseModal from './BaseModal.vue'
  import BaseTabs from './BaseTabs.vue'
  import ColorPicker from './ColorPicker.vue'
  import BaseTextarea from './common/BaseTextarea.vue'
  import BaseTooltip from './common/BaseTooltip.vue'
  import DrawingTemplateMenu from './DrawingTemplateMenu.vue'
  import {
    type DrawingColorField,
    drawingColorFields,
    drawingSettingsConfigs,
  } from './drawing-settings/config.js'
  import DrawingTemplateSaveDialog from './drawing-settings/DrawingTemplateSaveDialog.vue'

  const props = defineProps<{
    show: boolean
    drawing: DrawingObject
    editableStyleKeys: ReadonlyArray<keyof DrawingStyle>
  }>()
  const emit = defineEmits<{
    close: []
    updateStyle: [style: Partial<DrawingStyle>]
    updateText: [target: 'line' | 'area', text: string, position: DrawingLabelPosition]
  }>()
  const activeTab = ref<'style' | 'text'>('style')
  const config = computed(() => drawingSettingsConfigs[props.drawing.kind])
  const visibleStyleFields = computed(() =>
    config.value.style.filter((field) => props.editableStyleKeys.includes(field)),
  )
  const templateFields = computed(() => templateStyleFields(props.editableStyleKeys))
  const textTarget = computed(() => config.value.text[0] ?? null)
  function drawingColorValue(field: DrawingColorField): string {
    return props.drawing.style[field] ?? props.drawing.style.stroke ?? DEFAULT_DRAWING_STROKE
  }
  const tabs = computed(() => [
    { id: 'style' as const, label: '样式' },
    ...(textTarget.value ? [{ id: 'text' as const, label: '文本' }] : []),
  ])
  const textDraft = ref('')
  const textPosition = ref<DrawingLabelPosition>('center')
  const alignmentOptions = [
    { position: 'start', label: '靠左', icon: IconTablerAlignLeft },
    { position: 'center', label: '居中', icon: IconTablerAlignCenter },
    { position: 'end', label: '靠右', icon: IconTablerAlignRight },
  ] as const
  function syncTextDraft() {
    const label = textTarget.value ? props.drawing.labels?.[textTarget.value]['0'] : undefined
    textDraft.value = label?.text ?? ''
    textPosition.value = label?.position ?? 'center'
  }
  function updateText() {
    if (textTarget.value) emit('updateText', textTarget.value, textDraft.value, textPosition.value)
  }
  function setTextPosition(position: DrawingLabelPosition) {
    if (textPosition.value === position) return
    textPosition.value = position
    if (textDraft.value.trim()) updateText()
  }
  const {
    templates,
    names: templateNames,
    busy,
    error: templateError,
    savedName,
    clearError,
    reload: reloadTemplates,
    save: persistTemplate,
    remove: removeStoredTemplate,
  } = useDrawingTemplates(computed(() => props.drawing.kind))
  const savingTemplate = ref(false)

  function openSaveTemplate() {
    clearError()
    savingTemplate.value = true
  }

  function applyTemplate(name: string) {
    const template = templates.value.find((item) => item.name === name)
    if (!template) return
    const style = resolveTemplateStyle(template, templateFields.value)
    const label = resolveTemplateLabel(template, props.drawing)
    if (label) {
      textPosition.value = label.position
      emit('updateText', label.target, label.text, label.position)
    }
    if (Object.keys(style).length) emit('updateStyle', style)
  }

  async function saveTemplate(name: string) {
    if (!name) return
    const template = captureDrawingTemplate(name, props.drawing, templateFields.value)
    if (await persistTemplate(template)) savingTemplate.value = false
  }

  async function saveExistingTemplate(name: string) {
    const template = captureDrawingTemplate(name, props.drawing, templateFields.value)
    await persistTemplate(template, true)
  }

  async function deleteTemplate(name: string) {
    await removeStoredTemplate(name)
  }

  watch(
    () => props.show,
    (show) => {
      if (show) {
        activeTab.value = 'style'
        syncTextDraft()
        savingTemplate.value = false
        clearError()
        void reloadTemplates()
      }
    },
  )
  watch(
    () => props.drawing.kind,
    () => {
      activeTab.value = 'style'
      syncTextDraft()
      savingTemplate.value = false
      void reloadTemplates()
    },
  )
  onMounted(() => {
    if (props.show) {
      syncTextDraft()
      void reloadTemplates()
    }
  })
  watch(() => props.drawing.id, syncTextDraft)
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

  .text-row {
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 13px;
  }

  .text-row__field {
    background: var(--klc-color-ui-control-background);
  }

  .text-settings {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .text-alignment {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    font-size: 13px;
  }

  .text-alignment__options {
    display: flex;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 6px;
    overflow: hidden;
  }

  .text-alignment__options button {
    display: grid;
    place-items: center;
    width: 34px;
    height: 30px;
    padding: 0;
    border: 0;
    border-right: 1px solid var(--klc-color-ui-border);
    background: var(--klc-color-ui-control-background);
    color: var(--klc-color-ui-muted);
    cursor: pointer;
  }

  .text-alignment__options button:last-child {
    border-right: 0;
  }

  .text-alignment__options button:hover,
  .text-alignment__options button.is-active {
    background: var(--klc-color-ui-hover);
    color: var(--klc-color-ui-text);
  }

  .text-alignment__options svg {
    width: 16px;
    height: 16px;
  }

  .template-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    width: 100%;
  }

  .template-actions :deep(.drawing-template-menu-trigger) {
    height: 28px;
    padding: 0 10px;
    font-size: 13px;
  }

</style>
