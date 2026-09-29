import type { DrawingObject, DrawingStyle } from '@363045841yyt/klinechart-core/controllers'
import { computed, type Ref, ref, watch } from 'vue'

import { drawingSettingsConfigs } from '../../components/drawing-settings/config.js'
import {
  applicableTemplateStyle,
  captureTemplateStyle,
  type DrawingTemplate,
  loadDrawingTemplates,
  saveDrawingTemplates,
} from '../../components/drawing-settings/templates.js'

/** Floating toolbar facade over the existing per-kind IndexedDB template contract. */
export function useCanvasDrawingTemplates(
  selectedDrawings: Readonly<Ref<ReadonlyArray<DrawingObject>>>,
  editableStyleKeys: Readonly<Ref<ReadonlyArray<keyof DrawingStyle>>>,
  updateStyle: (style: Partial<DrawingStyle>) => void,
) {
  const templates = ref<DrawingTemplate[]>([])
  const names = computed(() => templates.value.map((item) => item.name))
  const canUse = computed(() => fields.value.length > 0)
  const showSave = ref(false)
  const busy = ref(false)
  const error = ref('')
  let loadVersion = 0

  const fields = computed(() => {
    const selection = selectedDrawings.value
    if (!selection.length) return []
    return drawingSettingsConfigs[selection[0]!.kind].style.filter(
      (field) =>
        editableStyleKeys.value.includes(field) &&
        selection.every((drawing) => drawingSettingsConfigs[drawing.kind].style.includes(field)),
    )
  })

  async function reload() {
    const kind = selectedDrawings.value[0]?.kind
    const version = ++loadVersion
    templates.value = []
    if (!kind) return
    try {
      const loaded = await loadDrawingTemplates(kind)
      if (version === loadVersion && selectedDrawings.value[0]?.kind === kind)
        templates.value = loaded
    } catch {
      error.value = '加载模板失败'
    }
  }

  async function apply(name: string) {
    const kind = selectedDrawings.value[0]?.kind
    const ids = selectedDrawings.value.map((drawing) => drawing.id).join('\0')
    if (!kind || !templates.value.some((template) => template.name === name)) return
    try {
      const template = (await loadDrawingTemplates(kind)).find((item) => item.name === name)
      if (!template || selectedDrawings.value.map((drawing) => drawing.id).join('\0') !== ids)
        return
      const style = applicableTemplateStyle(template, fields.value)
      if (style.fill !== undefined || style.stroke !== undefined) updateStyle(style)
    } catch {
      error.value = '加载模板失败'
    }
  }

  function openSave() {
    if (selectedDrawings.value.length !== 1) return
    error.value = ''
    showSave.value = true
  }

  async function save(name: string) {
    const drawing = selectedDrawings.value[0]
    if (selectedDrawings.value.length !== 1 || !drawing || busy.value) return
    const style = captureTemplateStyle(drawing, fields.value)
    if (!style.fill && !style.stroke) return
    busy.value = true
    try {
      const current = await loadDrawingTemplates(drawing.kind)
      const next = [...current.filter((item) => item.name !== name), { name, style }]
      if (!(await saveDrawingTemplates(drawing.kind, next))) throw new Error('save failed')
      if (selectedDrawings.value.length === 1 && selectedDrawings.value[0]?.id === drawing.id) {
        templates.value = next
      }
      showSave.value = false
    } catch {
      error.value = '模板保存失败'
    } finally {
      busy.value = false
    }
  }

  watch(
    () => selectedDrawings.value.map((drawing) => drawing.id).join('\0'),
    () => {
      ++loadVersion
      templates.value = []
      if (!busy.value) showSave.value = false
    },
  )

  return { names, canUse, showSave, busy, error, reload, apply, openSave, save }
}
