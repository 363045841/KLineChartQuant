<template>
  <BaseModal
    :open="show"
    title="图元设置"
    size="sm"
    @update:open="!$event && emit('close')"
  >
    <template #tabs>
      <BaseTabs v-model="activeTab" :tabs="tabs" :panel-id="panelId" aria-label="图元设置" />
    </template>
    <div v-bind="panelAttrs" class="drawing-settings-body">
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
        <label v-if="textTargets.length > 1" class="text-row">
          <span>标注目标</span>
          <select v-model="textTarget" class="text-row__select">
            <option v-for="target in textTargets" :key="target" :value="target">
              {{ labelTargetName(target) }}
            </option>
          </select>
        </label>
        <label class="text-row">
          <span>文本</span>
          <BaseTextarea
            v-model="textDraft"
            class="text-row__field"
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
  import type {
    DrawingLabelPosition,
    DrawingLabelTarget,
    DrawingObject,
    DrawingStyle,
  } from '@363045841yyt/klinechart-core/controllers'
  import {
    captureDrawingTemplate,
    resolveTemplateLabel,
    resolveTemplateStyle,
    templateStyleFields,
  } from '@363045841yyt/klinechart-core/engine/drawing'
  import ColorPicker from '@vue-src/components/color/impl/ColorPicker.vue'
  import BaseButton from '@vue-src/components/common/button/BaseButton.vue'
  import BaseModal from '@vue-src/components/common/dialog/BaseModal.vue'
  import BaseTextarea from '@vue-src/components/common/form/BaseTextarea.vue'
  import BaseTooltip from '@vue-src/components/common/overlay/BaseTooltip.vue'
  import BaseTabs from '@vue-src/components/common/tabs/BaseTabs.vue'
  import { useTabPanel } from '@vue-src/components/common/tabs/useTabPanel.js'
  import {
    type DrawingColorField,
    drawingColorFields,
    drawingSettingsConfigs,
  } from '@vue-src/components/drawing/settings/config.js'
  import DrawingTemplateSaveDialog from '@vue-src/components/drawing/settings/DrawingTemplateSaveDialog.vue'
  import { useDrawingTemplates } from '@vue-src/composables/chart/useDrawingTemplates.js'
  import { computed, onMounted, ref, watch } from 'vue'
  import IconTablerAlignCenter from '~icons/tabler/align-center'
  import IconTablerAlignLeft from '~icons/tabler/align-left'
  import IconTablerAlignRight from '~icons/tabler/align-right'
  import DrawingTemplateMenu from './DrawingTemplateMenu.vue'
  import { labelTargetName, useDrawingSettingsText } from './settings/useDrawingSettingsText.js'

  const props = defineProps<{
    show: boolean
    drawing: DrawingObject
    editableStyleKeys: ReadonlyArray<keyof DrawingStyle>
  }>()
  const emit = defineEmits<{
    close: []
    updateStyle: [style: Partial<DrawingStyle>]
    updateText: [target: DrawingLabelTarget, text: string, position: DrawingLabelPosition]
  }>()
  const activeTab = ref<'style' | 'text'>('style')
  const { panelId, panelAttrs } = useTabPanel(() => activeTab.value)
  const config = computed(() => drawingSettingsConfigs[props.drawing.kind])
  const visibleStyleFields = computed(() =>
    config.value.style.filter((field) => props.editableStyleKeys.includes(field)),
  )
  const templateFields = computed(() => templateStyleFields(props.editableStyleKeys))
  const { textTargets, textTarget, textDraft, textPosition, updateText, setTextPosition } =
    useDrawingSettingsText(
      () => props.drawing,
      () => props.show,
      (target, text, position) => emit('updateText', target, text, position),
    )
  function drawingColorValue(field: DrawingColorField): string {
    return props.drawing.style[field] ?? props.drawing.style.stroke
  }
  const tabs = computed(() => [
    { id: 'style' as const, label: '样式' },
    ...(textTarget.value ? [{ id: 'text' as const, label: '文本' }] : []),
  ])
  const alignmentOptions = [
    { position: 'start', label: '靠左', icon: IconTablerAlignLeft },
    { position: 'center', label: '居中', icon: IconTablerAlignCenter },
    { position: 'end', label: '靠右', icon: IconTablerAlignRight },
  ] as const
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
      savingTemplate.value = false
      void reloadTemplates()
    },
  )
  onMounted(() => {
    if (props.show) {
      void reloadTemplates()
    }
  })
</script>

<style scoped>
  .drawing-settings-body {
    min-height: 180px;
    /* 与 tab 栏、动作栏之间保留 8px 安全区。 */
    padding-block: var(--klc-space-8, 8px);
  }

  .color-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding-block: 8px;
    /* 弹窗正文贴边，行自己消费横向 inset。 */
    padding-inline: var(--base-modal-content-inset);
    font-size: 13px;
    cursor: pointer;
  }

  .text-row {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-inline: var(--base-modal-content-inset);
    font-size: 13px;
  }

  .text-row__field {
    background: var(--klc-color-ui-control-background);
  }

  .text-row__select {
    padding: var(--klc-space-8, 8px);
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 6px;
    background: var(--klc-color-ui-control-background);
    color: var(--klc-color-ui-text);
    font: inherit;
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
    padding-inline: var(--base-modal-content-inset);
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
    /* 模板下拉触发器按 Footer 文本动作呈现：度量对齐 BaseButton size="sm"，
       通过 control-button 变量设置，不穿透组件。 */
    --control-button-height: var(--base-button-height, 28px);
    --control-button-inline-padding: var(--klc-space-8, 8px);
    --control-button-color: var(--klc-color-ui-muted);
    --control-button-active-color: var(--klc-color-ui-text);
    --control-button-font-size: var(--klc-text-12-font-size, 12px);
    --control-button-line-height: 1.2;
    --control-button-focus-outline: 2px solid var(--klc-color-ui-focus);
    --control-button-focus-outline-offset: 2px;
  }

</style>
