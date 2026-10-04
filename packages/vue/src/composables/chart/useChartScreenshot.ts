/** 将 chart-main 与底部水印统一导出为 PNG，供下载和剪贴板共用。 */
import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
import { type Ref, ref } from 'vue'
import '@fontsource/outfit/latin-600.css'
import { captureChartImage } from './captureChartImage.js'

export const chartScreenshotLabels = {
  capture: '截图',
  capturing: '截图中…',
  download: '下载图片',
  copy: '复制到剪贴板',
  failed: '截图失败，请重试',
  copyFailed: '复制失败，请重试',
  clipboardUnavailable: '当前环境不支持复制图片到剪贴板',
}

export const chartScreenshotActions = {
  download: 'download',
  copy: 'copy',
} as const

export type ChartScreenshotAction =
  (typeof chartScreenshotActions)[keyof typeof chartScreenshotActions]

const SCREENSHOT_FILE_PREFIX = 'chart'
const PNG_EXTENSION = '.png'
const PNG_MIME_TYPE = 'image/png'
const CHART_BACKGROUND_TOKEN = '--klc-color-ui-background'
const SCREENSHOT_SURFACE_TOKEN = '--klc-color-ui-surface'
const SCREENSHOT_PADDING = 24
const WATERMARK_LIGHT_TEXT_TOKEN = '--klc-color-text-primary'
const WATERMARK_DARK_TEXT_TOKEN = '--klc-color-text-white'
const WATERMARK_BRAND_TEXT_TOKEN = '--klc-color-ui-muted'
const WATERMARK_TEXT = 'KLineChartQuant'
const WATERMARK_SEPARATOR = ' · '
const WATERMARK_HORIZONTAL_PADDING = 16
const WATERMARK_LINE_GAP = 12
const WATERMARK_FONT_SIZE = 20
const WATERMARK_FONT_FAMILY = 'Outfit, sans-serif'
const WATERMARK_FONT_WEIGHT = 600
const WATERMARK_FONT = `${WATERMARK_FONT_WEIGHT} ${WATERMARK_FONT_SIZE}px ${WATERMARK_FONT_FAMILY}`
const WATERMARK_NAME_FONT_FAMILY = '"HarmonyOS Sans", sans-serif'
const WATERMARK_NAME_FONT_WEIGHT = 500
const WATERMARK_NAME_FONT = `${WATERMARK_NAME_FONT_WEIGHT} ${WATERMARK_FONT_SIZE}px ${WATERMARK_NAME_FONT_FAMILY}`
let harmonyFontPromise: Promise<FontFace> | undefined

/** 首次截图时加载随包提供的 HarmonyOS Sans 中文字体，后续复用字体。 */
function loadHarmonyFont(): Promise<FontFace> {
  if (!harmonyFontPromise) {
    const fontUrl = new URL('../../assets/fonts/HarmonyOS_Sans_SC_Medium.ttf', import.meta.url)
    const font = new FontFace('HarmonyOS Sans', `url("${fontUrl.href}")`, {
      weight: String(WATERMARK_NAME_FONT_WEIGHT),
    })
    document.fonts.add(font)
    harmonyFontPromise = font.load()
  }
  return harmonyFontPromise
}

/** 将 Canvas 编码为 PNG Blob，编码失败时拒绝 Promise。 */
function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error(chartScreenshotLabels.failed))
    }, PNG_MIME_TYPE)
  })
}

/** 绘制透明文字图层并裁去上下空行，让排版间距以实际字形像素边界为准。 */
function createWatermarkTextImage(
  width: number,
  scale: number,
  text: string,
  color: string,
  family: string,
  weight: number,
): HTMLCanvasElement {
  const image = document.createElement('canvas')
  const fontSize = WATERMARK_FONT_SIZE * scale
  const baseline = Math.ceil(fontSize * 2)
  image.width = width
  image.height = Math.ceil(fontSize * 3)
  const context = image.getContext('2d')
  if (!context) throw new Error(chartScreenshotLabels.failed)
  context.font = `${weight} ${fontSize}px ${family}`
  context.fillStyle = color
  context.textBaseline = 'alphabetic'
  context.textAlign = 'center'
  context.fillText(
    text,
    width / 2,
    baseline,
    width - WATERMARK_HORIZONTAL_PADDING * 2 * scale,
  )
  const pixels = context.getImageData(0, 0, image.width, image.height)
  let lastVisiblePixel = pixels.data.length / 4 - 1
  // Alpha 为零才算留白，以实际绘制结果计算边界，不依赖字体度量的取整方式。
  while (lastVisiblePixel >= 0 && pixels.data[lastVisiblePixel * 4 + 3] === 0) {
    lastVisiblePixel -= 1
  }
  if (lastVisiblePixel < 0) throw new Error(chartScreenshotLabels.failed)
  let firstVisiblePixel = 0
  while (pixels.data[firstVisiblePixel * 4 + 3] === 0) firstVisiblePixel += 1
  const firstRow = Math.floor(firstVisiblePixel / image.width)
  const lastRow = Math.floor(lastVisiblePixel / image.width)
  image.height = lastRow - firstRow + 1
  context.putImageData(pixels, 0, -firstRow)
  return image
}

/** 捕获 DOM，合成带留白和独立水印页脚的完整图表，供所有导出方式共用。 */
async function createScreenshot(
  element: HTMLElement,
  symbol: string,
  name: string,
  captureFrame: ChartController['captureFrame'],
): Promise<HTMLCanvasElement> {
  const instrumentText = [name.trim(), symbol.trim()]
    .filter(Boolean)
    .join(WATERMARK_SEPARATOR)
  // 品种信息与品牌分行呈现，字体准备完成后再绘制，避免中文使用系统替代字形。
  await Promise.all([
    document.fonts.load(WATERMARK_FONT, WATERMARK_TEXT),
    loadHarmonyFont(),
  ])
  await document.fonts.load(WATERMARK_NAME_FONT, instrumentText)
  const styles = getComputedStyle(element)
  const backgroundColor = styles.getPropertyValue(CHART_BACKGROUND_TOKEN).trim()
  const { image, scale } = await captureFrame(async (frame) => ({
    image: await captureChartImage(element, frame, backgroundColor),
    scale: frame.dpr,
  }))
  // 留白和页脚使用同一像素比例，保持高 DPR 下的视觉尺寸一致。
  const padding = Math.round(SCREENSHOT_PADDING * scale)
  const footerTop = padding + image.height
  const result = document.createElement('canvas')
  const context = result.getContext('2d')
  if (!context) throw new Error(chartScreenshotLabels.failed)
  result.width = image.width + padding * 2
  const brand = createWatermarkTextImage(
    result.width,
    scale,
    WATERMARK_TEXT,
    styles.getPropertyValue(WATERMARK_BRAND_TEXT_TOKEN).trim(),
    WATERMARK_FONT_FAMILY,
    WATERMARK_FONT_WEIGHT,
  )
  const watermarkTextToken =
    styles.colorScheme === 'dark' ? WATERMARK_DARK_TEXT_TOKEN : WATERMARK_LIGHT_TEXT_TOKEN
  const instrument = createWatermarkTextImage(
    result.width,
    scale,
    instrumentText,
    styles.getPropertyValue(watermarkTextToken).trim(),
    WATERMARK_NAME_FONT_FAMILY,
    WATERMARK_NAME_FONT_WEIGHT,
  )
  const instrumentTop = footerTop + padding
  const brandTop = instrumentTop + instrument.height + Math.round(WATERMARK_LINE_GAP * scale)
  // 图表上方、图表到品种文字上沿、品牌文字下沿到底边共用同一个 padding。
  result.height = brandTop + brand.height + padding
  context.imageSmoothingEnabled = false
  context.fillStyle = styles.getPropertyValue(SCREENSHOT_SURFACE_TOKEN).trim()
  context.fillRect(0, 0, result.width, result.height)
  context.drawImage(image, padding, padding)
  context.drawImage(instrument, 0, instrumentTop)
  // 品牌保留相同字号，仅通过主题灰色降低视觉权重。
  context.drawImage(brand, 0, brandTop)
  return result
}

/** 接收截图区域、品种代码和名称，返回下载或复制操作、忙碌状态和结果提示。 */
export function useChartScreenshot(
  target: Ref<HTMLElement | null>,
  symbol: Ref<string>,
  name: Readonly<Ref<string>>,
  getController: () => ChartController | null,
) {
  const isCapturing = ref(false)
  const screenshotMessage = ref<string | null>(null)

  /** 共用截图、水印和 PNG 编码链路，仅按菜单选项选择输出位置。 */
  async function captureScreenshot(action: ChartScreenshotAction): Promise<void> {
    if (isCapturing.value) return
    const element = target.value
    const controller = getController()
    if (!element || !controller || element.clientWidth === 0 || element.clientHeight === 0) return
    if (
      action === chartScreenshotActions.copy &&
      (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined')
    ) {
      screenshotMessage.value = chartScreenshotLabels.clipboardUnavailable
      return
    }

    isCapturing.value = true
    screenshotMessage.value = null
    try {
      // 点击时固定品种信息，避免异步截图期间切换品种导致水印与文件名不一致。
      const capturedSymbol = symbol.value
      const imagePromise = createScreenshot(
        element,
        capturedSymbol,
        name.value,
        controller.captureFrame,
      ).then(canvasToPng)
      if (action === chartScreenshotActions.copy) {
        // 先发起 write，再异步生成图片，保留浏览器要求的用户手势授权。
        await navigator.clipboard.write([
          new ClipboardItem({ [PNG_MIME_TYPE]: imagePromise }),
        ])
        return
      }
      const image = await imagePromise
      const symbolName = capturedSymbol.replace(/[\\/:*?"<>|]/g, '-')
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const link = document.createElement('a')
      link.download =
        [SCREENSHOT_FILE_PREFIX, symbolName, timestamp].filter(Boolean).join('-') + PNG_EXTENSION
      const imageUrl = URL.createObjectURL(image)
      try {
        link.href = imageUrl
        link.click()
      } finally {
        URL.revokeObjectURL(imageUrl)
      }
    } catch {
      screenshotMessage.value =
        action === chartScreenshotActions.copy
          ? chartScreenshotLabels.copyFailed
          : chartScreenshotLabels.failed
    } finally {
      isCapturing.value = false
    }
  }

  return { isCapturing, screenshotMessage, captureScreenshot }
}
