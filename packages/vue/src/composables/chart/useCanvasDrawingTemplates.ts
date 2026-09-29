// 画布浮条的模板门面：在共享模板 CRUD 之上叠加选区字段交集与样式/文字写入。

import type {
  DrawingLabelPosition,
  DrawingObject,
  DrawingStyle,
} from '@363045841yyt/klinechart-core/controllers'
import type { DrawingTemplateStore } from '@363045841yyt/klinechart-core/engine/drawing'
import {
  captureDrawingTemplate,
  resolveTemplateLabel,
  resolveTemplateStyle,
  templateStyleFields,
} from '@363045841yyt/klinechart-core/engine/drawing'
import type { Ref } from 'vue'
import { computed, ref, watch } from 'vue'

import { useDrawingTemplates } from './useDrawingTemplates.js'

/**
 * 画布浮条的模板能力：模板名列表、保存弹窗状态与保存/应用/删除动作。
 * @param selectedDrawings 当前选中图元
 * @param editableStyleKeys Core 对当前选区确认的可编辑样式字段
 * @param updateStyle 样式写入回调
 * @param updateLabel 文本位置写入回调
 * @param store 模板仓库，默认 IndexedDB 实现，测试可注入替身
 */
export function useCanvasDrawingTemplates(
  selectedDrawings: Readonly<Ref<ReadonlyArray<DrawingObject>>>,
  editableStyleKeys: Readonly<Ref<ReadonlyArray<keyof DrawingStyle>>>,
  updateStyle: (style: Partial<DrawingStyle>) => void,
  updateLabel: (
    id: string,
    target: 'line' | 'area',
    index: number,
    text: string,
    position: DrawingLabelPosition,
  ) => void,
  store?: DrawingTemplateStore,
) {
  const scopeKind = computed(() => selectedDrawings.value[0]?.kind)
  const {
    templates,
    names,
    busy,
    error,
    savedName,
    clearError,
    reload,
    save: persist,
    remove: deleteTemplate,
  } = useDrawingTemplates(scopeKind, store)
  const showSave = ref(false)

  /** Core 已按当前选区算好可编辑字段交集，这里只需筛出模板字段。 */
  const fields = computed(() => templateStyleFields(editableStyleKeys.value))
  const canUse = computed(() => fields.value.length > 0)

  function openSave() {
    if (selectedDrawings.value.length !== 1) return
    clearError()
    showSave.value = true
  }

  /** 应用模板：先写已有多段文本的位置，再整体写样式，避免样式被旧快照覆盖。 */
  function apply(name: string) {
    const template = templates.value.find((item) => item.name === name)
    if (!template || selectedDrawings.value.length === 0) return
    const style = resolveTemplateStyle(template, fields.value)
    for (const drawing of selectedDrawings.value) {
      const label = resolveTemplateLabel(template, drawing)
      if (label) updateLabel(drawing.id, label.target, 0, label.text, label.position)
    }
    if (Object.keys(style).length) updateStyle(style)
  }

  async function save(name: string) {
    const drawing = selectedDrawings.value[0]
    if (selectedDrawings.value.length !== 1 || !drawing) return
    const template = captureDrawingTemplate(name, drawing, fields.value)
    if (await persist(template)) showSave.value = false
  }

  async function saveExisting(name: string) {
    const drawing = selectedDrawings.value[0]
    if (selectedDrawings.value.length !== 1 || !drawing) return
    const template = captureDrawingTemplate(name, drawing, fields.value)
    await persist(template, true)
  }

  // 保存针对单个图元，选区变化后按钮语义失效，直接收起保存弹窗。
  watch(
    () => selectedDrawings.value.map((drawing) => drawing.id).join('\0'),
    () => {
      if (!busy.value) showSave.value = false
    },
  )

  return {
    names,
    canUse,
    showSave,
    busy,
    error,
    savedName,
    reload,
    apply,
    openSave,
    save,
    saveExisting,
    remove: deleteTemplate,
  }
}
