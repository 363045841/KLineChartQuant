// 管理取色浮层、Token 色块和会话内共享的自定义颜色。
import { COLOR_PICKER_CSS_VARS } from '@363045841yyt/klinechart-core'
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { useClickOutside } from '../../../composables/useClickOutside.js'
import { useFullscreenTeleportTarget } from '../../../composables/useFullscreenTeleportTarget.js'
import { useTeleportedPopup } from '../../../composables/useTeleportedPopup.js'
import type { ColorPickerProps, PickerColor, ScreenEyeDropper } from '../types.js'
import { parsePickerColor, pickerColorToHex } from './colorSpace.js'

const customColors = ref<string[]>([])
const MAX_CUSTOM_COLORS = 12
const commonColors = [
  { token: 'ui-background', label: '背景色' },
  { token: 'ui-text', label: '文字色' },
  { token: 'ui-muted', label: '灰色' },
  { token: 'candle-up-body', label: '上涨色' },
  { token: 'candle-down-body', label: '下跌色' },
  ...Array.from({ length: 7 }, (_, index) => ({
    token: `palette-i${index + 1}`,
    label: `常用色 ${index + 1}`,
  })),
]

/** 连接颜色输入与浮层交互，所有颜色修改通过 emit 交给调用方。 */
export function useColorPicker(props: ColorPickerProps, emitColor: (color: string) => void) {
  const triggerRef = ref<HTMLElement | null>(null)
  const panelRef = ref<HTMLElement | null>(null)
  const isOpen = ref(false)
  const draft = ref('')
  const invalid = ref(false)
  const picking = ref(false)
  const color = ref<PickerColor>({ hue: 0, saturation: 0, brightness: 0, alpha: 1 })
  const hueColor = computed(() => `hsl(${color.value.hue} 100% 50%)`)
  const opaqueColor = computed(() => pickerColorToHex({ ...color.value, alpha: 1 }))
  const cursorStyle = computed(() => ({
    left: `${color.value.saturation * 100}%`,
    top: `${(1 - color.value.brightness) * 100}%`,
  }))
  const teleportTarget = useFullscreenTeleportTarget()
  const { popupStyle, startPositionSync, stopPositionSync } = useTeleportedPopup(
    triggerRef,
    panelRef,
  )
  let abortController: AbortController | undefined
  const eyeDropper = ref<ScreenEyeDropper | null>(null)
  const screenError = ref('')
  const panelStyle = computed(() => ({
    ...COLOR_PICKER_CSS_VARS,
    ...popupStyle.value,
    zIndex: 1010,
  }))

  /** 关闭面板并取消尚未完成的屏幕取色。 */
  function close(restoreFocus = false) {
    isOpen.value = false
    abortController?.abort()
    stopPositionSync()
    if (restoreFocus) triggerRef.value?.focus()
  }

  useClickOutside(
    () => [triggerRef.value, panelRef.value],
    () => close(),
    {
      enabled: () => isOpen.value && !picking.value,
    },
  )

  /** 打开面板，将当前预览色映射到色板坐标。 */
  async function toggle() {
    if (isOpen.value) return close(true)
    if (props.disabled) return
    draft.value = props.modelValue
    invalid.value = false
    screenError.value = ''
    const preview = triggerRef.value?.querySelector<HTMLElement>('.color-picker__preview')
    if (preview) syncColor(getComputedStyle(preview).backgroundColor)
    // 浏览器支持时才展示额外的屏幕取色入口。
    if (window.EyeDropper) {
      eyeDropper.value = new window.EyeDropper()
    }
    isOpen.value = true
    startPositionSync()
    await nextTick()
    panelRef.value?.querySelector<HTMLElement>('.color-picker__plane')?.focus()
  }

  /** 选中颜色并关闭面板。 */
  function select(color: string) {
    emitColor(color)
    close(true)
  }

  /** 从 Token 渲染后的色块读取实际颜色，保持当前主题的颜色语义。 */
  function selectCommon(event: MouseEvent) {
    if (event.currentTarget instanceof HTMLElement) {
      select(getComputedStyle(event.currentTarget).backgroundColor)
    }
  }

  /** 校验并添加颜色，最多保留最近的十二种供所有实例复用。 */
  function addColor(color: string) {
    const value = color.trim()
    invalid.value = !CSS.supports('color', value)
    if (invalid.value) return
    customColors.value = [value, ...customColors.value.filter((item) => item !== value)].slice(
      0,
      MAX_CUSTOM_COLORS,
    )
    select(value)
  }

  /** 同步色板坐标；无彩色保持色相，方便从灰色继续调色。 */
  function syncColor(value: string) {
    const parsed = parsePickerColor(value)
    if (!parsed) return
    if (parsed.saturation === 0) parsed.hue = color.value.hue
    color.value = parsed
  }

  /** 将移动后的色板颜色实时写入调用方，保持浮层打开。 */
  function applyColor() {
    draft.value = pickerColorToHex(color.value)
    invalid.value = false
    emitColor(draft.value)
  }

  /** 将指针位置限制在色板内，拖动时连续改变饱和度和明度。 */
  function moveOnPlane(event: PointerEvent) {
    const plane = event.currentTarget
    if (!(plane instanceof HTMLElement)) return
    if (event.type === 'pointermove' && !plane.hasPointerCapture(event.pointerId)) return
    if (event.type === 'pointerdown') {
      if (event.button !== 0) return
      event.preventDefault()
      plane.focus()
      plane.setPointerCapture(event.pointerId)
    }
    const rect = plane.getBoundingClientRect()
    color.value.saturation = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    color.value.brightness = 1 - Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
    applyColor()
  }

  /** 指针抬起或取消时结束拖动，鼠标和触屏共用 Pointer Capture。 */
  function endPlaneDrag(event: PointerEvent) {
    const plane = event.currentTarget
    if (plane instanceof HTMLElement && plane.hasPointerCapture(event.pointerId)) {
      plane.releasePointerCapture(event.pointerId)
    }
  }

  /** 方向键调整色板位置，Shift 加快步进。 */
  function onPlaneKey(event: KeyboardEvent) {
    const step = event.shiftKey ? 0.1 : 0.01
    switch (event.key) {
      case 'ArrowLeft':
        color.value.saturation = Math.max(0, color.value.saturation - step)
        break
      case 'ArrowRight':
        color.value.saturation = Math.min(1, color.value.saturation + step)
        break
      case 'ArrowDown':
        color.value.brightness = Math.max(0, color.value.brightness - step)
        break
      case 'ArrowUp':
        color.value.brightness = Math.min(1, color.value.brightness + step)
        break
      default:
        return
    }
    event.preventDefault()
    event.stopPropagation()
    applyColor()
  }

  /** 将色相或透明度滑条的位置映射到颜色并实时预览。 */
  function onSliderInput(event: Event, channel: 'hue' | 'alpha') {
    if (!(event.target instanceof HTMLInputElement)) return
    color.value[channel] = Number(event.target.value)
    applyColor()
  }

  /** 手动编辑颜色值后同步色板与预览，非法输入保留给用户修正。 */
  function onDraftChange() {
    invalid.value = !CSS.supports('color', draft.value.trim())
    if (invalid.value) return
    syncColor(draft.value.trim())
    emitColor(draft.value.trim())
  }

  /** 使用浏览器 EyeDropper 读取屏幕颜色，取消时保持当前颜色。 */
  async function pickScreen() {
    if (!eyeDropper.value || picking.value) return
    abortController = new AbortController()
    screenError.value = ''
    picking.value = true
    try {
      const result = await eyeDropper.value.open({ signal: abortController.signal })
      if (isOpen.value) addColor(result.sRGBHex)
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        draft.value = props.modelValue
        invalid.value = false
        screenError.value = '屏幕取色未完成，请重试'
      }
    } finally {
      picking.value = false
    }
  }

  onBeforeUnmount(() => close())
  return {
    triggerRef,
    panelRef,
    isOpen,
    draft,
    invalid,
    picking,
    color,
    hueColor,
    opaqueColor,
    cursorStyle,
    teleportTarget,
    panelStyle,
    commonColors,
    customColors,
    eyeDropper,
    screenError,
    toggle,
    close,
    select,
    selectCommon,
    addColor,
    moveOnPlane,
    endPlaneDrag,
    onPlaneKey,
    onSliderInput,
    onDraftChange,
    pickScreen,
  }
}
