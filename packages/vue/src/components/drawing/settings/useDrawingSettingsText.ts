/** 管理文本页所选的命名目标和编辑草稿。 */
import type {
  DrawingLabelPosition,
  DrawingLabelTarget,
  DrawingObject,
} from '@363045841yyt/klinechart-core/controllers'
import {
  defaultLabelTarget,
  drawingLabelTargets,
} from '@363045841yyt/klinechart-core/engine/drawing'
import { computed, ref, watch } from 'vue'

const TARGET_NAMES: Partial<Record<DrawingLabelTarget, string>> = {
  line: '线条',
  horizontal: '水平线',
  vertical: '垂直线',
  top: '上边',
  right: '右边',
  bottom: '下边',
  left: '左边',
  inside: '内部',
  base: '基准线',
  opposite: '对侧线',
  median: '中线',
  upper: '上轨',
  lower: '下轨',
}

/** 将目标名转换成设置页的显示文本。 */
export function labelTargetName(target: DrawingLabelTarget): string {
  if (target.startsWith('level:')) {
    const ratio = Number(target.slice('level:'.length))
    return `${Number((ratio * 100).toPrecision(12))}%`
  }
  return TARGET_NAMES[target] ?? target
}

/** 打开设置时优先展示已有标签，切换目标时加载该目标对应的文本。 */
export function useDrawingSettingsText(
  drawing: () => DrawingObject,
  show: () => boolean,
  commit: (target: DrawingLabelTarget, text: string, position: DrawingLabelPosition) => void,
) {
  const textTargets = computed(() => drawingLabelTargets(drawing().kind, drawing().params))
  const selectedTarget = ref<DrawingLabelTarget | null>(null)
  const textTarget = computed({
    get(): DrawingLabelTarget | null {
      const targets = textTargets.value
      const selected = selectedTarget.value
      if (selected && targets.includes(selected)) return selected
      return (
        targets.find((target) => drawing().labels?.[target]) ??
        defaultLabelTarget(drawing().kind, drawing().params) ??
        null
      )
    },
    set(target) {
      selectedTarget.value = target
    },
  })
  const label = computed(() =>
    textTarget.value ? drawing().labels?.[textTarget.value] : undefined,
  )
  const textDraft = ref('')
  const textPosition = ref<DrawingLabelPosition>('center')

  watch([() => drawing().id, show], () => {
    selectedTarget.value = null
  })
  watch(
    [textTarget, () => label.value?.text, () => label.value?.position, show],
    () => {
      textDraft.value = label.value?.text.replaceAll('\\n', '\n') ?? ''
      textPosition.value = label.value?.position ?? 'center'
    },
    { immediate: true },
  )

  /** 保存当前目标的文本和位置。 */
  function updateText() {
    if (textTarget.value) commit(textTarget.value, textDraft.value, textPosition.value)
  }

  /** 选择位置时只写入已有文本。 */
  function setTextPosition(position: DrawingLabelPosition) {
    if (textPosition.value === position) return
    textPosition.value = position
    if (textDraft.value.trim()) updateText()
  }

  return { textTargets, textTarget, textDraft, textPosition, updateText, setTextPosition }
}
