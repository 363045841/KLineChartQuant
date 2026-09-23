<template>
  <BaseModal :show="show" title="图元设置" width="min(92vw, 440px)" @close="emit('close')">
    <template #tabs>
      <BaseTabs v-model="activeTab" :tabs="tabs" aria-label="图元设置" />
    </template>
    <div class="drawing-settings-body" role="tabpanel" :aria-label="activeTab === 'style' ? '样式' : '文字'">
      <template v-if="activeTab === 'style'">
        <label v-if="config.style.includes('fill') && editableStyleKeys.includes('fill')" class="color-row">
          <span>背景颜色</span>
          <ColorInput
            :value="drawing.style.fill ?? drawing.style.stroke ?? DEFAULT_DRAWING_STROKE"
            label="背景颜色"
            @change="emit('updateStyle', { fill: $event })"
          />
        </label>
        <label v-if="config.style.includes('stroke') && editableStyleKeys.includes('stroke')" class="color-row">
          <span>线条颜色</span>
          <ColorInput
            :value="drawing.style.stroke ?? DEFAULT_DRAWING_STROKE"
            label="线条颜色"
            @change="emit('updateStyle', { stroke: $event })"
          />
        </label>
      </template>
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
  import type { DrawingObject, DrawingStyle } from '@363045841yyt/klinechart-core/controllers'
  import { computed, onMounted, ref, useId, watch } from 'vue'

  import { useClickOutside } from '../composables/useClickOutside.js'
  import { drawingSettingsConfigs } from './drawing-settings/config.js'
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
  }>()
  const tabs = [
    { id: 'style', label: '样式' },
    { id: 'text', label: '文字' },
  ] as const
  const activeTab = ref<'style' | 'text'>('style')
  const templateFormId = useId()
  const config = computed(() => drawingSettingsConfigs[props.drawing.kind])
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
    if (config.value.style.includes('fill') && props.editableStyleKeys.includes('fill')) {
      style.fill = template.style.fill
    }
    if (config.value.style.includes('stroke') && props.editableStyleKeys.includes('stroke')) {
      style.stroke = template.style.stroke
    }
    if (style.fill !== undefined || style.stroke !== undefined) emit('updateStyle', style)
  }

  async function saveTemplate() {
    const name = templateName.value.trim()
    if (!name || busy.value) return
    const kind = props.drawing.kind
    const style: DrawingTemplate['style'] = {}
    if (config.value.style.includes('fill') && props.editableStyleKeys.includes('fill')) {
      style.fill = props.drawing.style.fill ?? props.drawing.style.stroke ?? DEFAULT_DRAWING_STROKE
    }
    if (config.value.style.includes('stroke') && props.editableStyleKeys.includes('stroke')) {
      style.stroke = props.drawing.style.stroke ?? DEFAULT_DRAWING_STROKE
    }
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
      applyMenuOpen.value = false
      savingTemplate.value = false
      templateError.value = ''
      void reloadTemplates()
    }
  })
  watch(() => props.drawing.kind, () => {
    applyMenuOpen.value = false
    savingTemplate.value = false
    templates.value = []
    templateError.value = ''
    void reloadTemplates()
  })
  onMounted(() => {
    if (props.show) void reloadTemplates()
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
