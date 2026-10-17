// 公共颜色选择器的输入契约。
export interface ColorPickerProps {
  modelValue: string
  label: string
  disabled?: boolean
}

export interface ScreenEyeDropper {
  open(options: { signal: AbortSignal }): Promise<{ sRGBHex: string }>
}

// 色相范围为 0–360，饱和度、明度和透明度范围为 0–1。
export interface PickerColor {
  hue: number
  saturation: number
  brightness: number
  alpha: number
}

declare global {
  interface Window {
    EyeDropper?: new () => ScreenEyeDropper
  }
}
