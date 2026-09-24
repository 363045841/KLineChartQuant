<template>
  <BaseModal :show="show" title="图元设置" width="min(92vw, 440px)" @close="emit('close')">
    <template #tabs>
      <BaseTabs v-model="activeTab" :tabs="tabs" aria-label="图元设置" />
    </template>
    <div class="drawing-settings-body" role="tabpanel" :aria-label="activeTab === 'style' ? '样式' : '文本'">
      <template v-if="activeTab === 'style'">
        <label v-for="field in visibleStyleFields" :key="field" class="color-row">
          <span>{{ drawingColorFields[field].label }}</span>
          <ColorInput
            :value="drawingColorValue(field)"
            :label="drawingColorFields[field].label"
            @change="emit('updateStyle', { [field]: $event })"
          />
        </label>
      </template>
      <div v-else-if="textTarget" class="text-settings">
        <label class="text-row">
          <span>文本</span>
          <textarea
            v-model="textDraft"
            rows="4"
            maxlength="200"
            aria-label="图元文本"
            @change="updateText"
          />
        </label>
        <div class="text-alignment">
          <span>位置</span>
          <div class="text-alignment__options" role="group" aria-label="文本位置">
            <button
              v-for="option in alignmentOptions"
              :key="option.position"
              type="button"
              :title="option.label"
              :aria-label="option.label"
              :aria-pressed="textPosition === option.position"
              :class="{ 'is-active': textPosition === option.position }"
              @click="setTextPosition(option.position)"
            >
              <component :is="option.icon" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
    <template #footer>
      <div class="template-actions">
        <BaseButton size="sm" :disabled="busy" @click="openSaveTemplate">保存为模板</BaseButton>
        <div ref="applyMenuRef" class="apply-template">
          <BaseButton
            size="sm"
            :disabled="busy || templates.length === 0"
            aria-haspopup="menu"
            :aria-expanded="applyMenuOpen"
            @click="applyMenuOpen = !applyMenuOpen"
            @keydown.escape.stop="applyMenuOpen = false"
          >应用模板</BaseButton>
          <div v-if="applyMenuOpen" class="apply-template__menu" role="menu" aria-label="应用模板" @keydown.escape.stop="applyMenuOpen = false">
            <button
              v-for="(template, index) in templates"
              :key="template.name"
              type="button"
              role="menuitem"
              @click="applyTemplate(index)"
            >{{ template.name }}</button>
          </div>
        </div>
      </div>
    </template>
  </BaseModal>
  <BaseModal
    :show="savingTemplate && show"
    title="保存图元模板"
    width="min(92vw, 360px)"
    @close="savingTemplate = false"
  >
    <form :id="templateFormId" class="template-form" @submit.prevent="saveTemplate">
      <label :for="`${templateFormId}-name`">模板名称</label>
      <input
        :id="`${templateFormId}-name`"
        v-model.trim="templateName"
        type="text"
        maxlength="40"
        autocomplete="off"
        autofocus
      />
      <span v-if="templateError" class="template-error" role="alert">{{ templateError }}</span>
    </form>
    <template #footer>
      <BaseButton :disabled="busy" @click="savingTemplate = false">取消</BaseButton>
      <BaseButton type="submit" :form="templateFormId" :disabled="!templateName || busy">
        保存
      </BaseButton>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import { DEFAULT_DRAWING_STROKE } from '@363045841yyt/klinechart-core'
  import type { DrawingLabelPosition, DrawingObject, DrawingStyle } from '@363045841yyt/klinechart-core/controllers'
  import { computed, onMounted, ref, useId, watch } from 'vue'
  import IconTablerAlignLeft from '~icons/tabler/align-left'
  import IconTablerAlignCenter from '~icons/tabler/align-center'
  import IconTablerAlignRight from '~icons/tabler/align-right'

  import { useClickOutside } from '../composables/useClickOutside.js'
  import {
    drawingColorFields,
    drawingSettingsConfigs,
    type DrawingColorField,
  } from './drawing-settings/config.js'
  import { loadDrawingTemplates, saveDrawingTemplates, type DrawingTemplate } from './drawing-settings/templates.js'

  import BaseModal from './BaseModal.vue'
  import BaseTabs from './BaseTabs.vue'
  import BaseButton from './BaseButton.vue'
  import ColorInput from './ColorInput.vue'

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
  const templateFormId = useId()
  const config = computed(() => drawingSettingsConfigs[props.drawing.kind])
  const visibleStyleFields = computed(() =>
    config.value.style.filter((field) => props.editableStyleKeys.includes(field)),
  )
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
  const templates = ref<DrawingTemplate[]>([])
  const savingTemplate = ref(false)
  const templateName = ref('')
  const templateError = ref('')
  const busy = ref(false)
  const applyMenuOpen = ref(false)
  const applyMenuRef = ref<HTMLElement | null>(null)
  useClickOutside(() => [applyMenuRef.value], () => { applyMenuOpen.value = false }, {
    enabled: () => applyMenuOpen.value,
  })

  let loadVersion = 0
  async function reloadTemplates() {
    const version = ++loadVersion
    const kind = props.drawing.kind
    const loaded = await loadDrawingTemplates(kind)
    if (version === loadVersion && kind === props.drawing.kind) templates.value = loaded
  }

  function openSaveTemplate() {
    applyMenuOpen.value = false
    templateError.value = ''
    templateName.value = ''
    savingTemplate.value = true
  }

  function applyTemplate(index: number) {
    applyMenuOpen.value = false
    const template = templates.value[index]
    if (!template) return
    const style: Partial<DrawingStyle> = {}
    for (const field of visibleStyleFields.value) {
      if (template.style[field] !== undefined) style[field] = template.style[field]
    }
    if (style.fill !== undefined || style.stroke !== undefined) emit('updateStyle', style)
  }

  async function saveTemplate() {
    const name = templateName.value.trim()
    if (!name || busy.value) return
    const kind = props.drawing.kind
    const style: DrawingTemplate['style'] = {}
    for (const field of visibleStyleFields.value) style[field] = drawingColorValue(field)
    if (!style.fill && !style.stroke) return
    const next = [...templates.value.filter((template) => template.name !== name), { name, style }]
    busy.value = true
    ++loadVersion
    try {
      await saveDrawingTemplates(kind, next)
      if (kind === props.drawing.kind) templates.value = next
      savingTemplate.value = false
      templateError.value = ''
    } catch (error) {
      console.error('保存图元模板失败', error)
      templateError.value = '模板保存失败'
    } finally {
      busy.value = false
    }
  }

  watch(() => props.show, (show) => {
    if (show) {
      activeTab.value = 'style'
      syncTextDraft()
      applyMenuOpen.value = false
      savingTemplate.value = false
      templateError.value = ''
      void reloadTemplates()
    }
  })
  watch(() => props.drawing.kind, () => {
    activeTab.value = 'style'
    syncTextDraft()
    applyMenuOpen.value = false
    savingTemplate.value = false
    templates.value = []
    templateError.value = ''
    void reloadTemplates()
  })
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

  .text-row textarea {
    width: 100%;
    box-sizing: border-box;
    padding: 8px 10px;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 4px;
    background: var(--klc-color-ui-control-background);
    color: var(--klc-color-ui-text);
    font: inherit;
    resize: vertical;
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

  .apply-template {
    position: relative;
  }

  .apply-template__menu {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 0;
    z-index: 1;
    min-width: 160px;
    max-width: min(280px, calc(100vw - 48px));
    max-height: 240px;
    overflow-y: auto;
    padding: 4px;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 6px;
    background: var(--klc-color-ui-surface);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  }

  .apply-template__menu button {
    display: block;
    width: 100%;
    padding: 8px 10px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--klc-color-ui-text);
    font-size: 13px;
    text-align: left;
    overflow-wrap: anywhere;
    cursor: pointer;
  }

  .apply-template__menu button:hover,
  .apply-template__menu button:focus-visible {
    background: var(--klc-color-ui-hover);
  }

  .template-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
    font-size: 13px;
  }

  .template-form input {
    min-width: 0;
    width: 100%;
    box-sizing: border-box;
    padding: 8px 10px;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 4px;
    background: var(--klc-color-ui-control-background);
    color: var(--klc-color-ui-text);
  }

  .template-error {
    color: var(--klc-color-down, #d33);
    font-size: 12px;
  }
</style>
