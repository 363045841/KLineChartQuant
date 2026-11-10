/** 将 chart-main 与底部水印统一导出为 PNG，供下载和剪贴板共用。 */
import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
import { type Ref, ref } from 'vue'
import {
  BRAND_MARK_PATH,
  BRAND_MARK_STROKE_WIDTH,
  BRAND_MARK_VIEWBOX,
} from '../../brandMark.js'
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
const WATERMARK_TEXT = 'KlineChartQuant'
/** 品牌折线标识相对字号的视觉高度，略高于文字大写高度以保持识别度。 */
const WATERMARK_BRAND_MARK_HEIGHT_RATIO = 0.9
/** 标识与品牌文字之间的间距，按字号缩放。 */
const WATERMARK_BRAND_MARK_GAP_RATIO = 0.4
const WATERMARK_SEPARATOR = ' · '
const WATERMARK_HORIZONTAL_PADDING = 16
const WATERMARK_LINE_GAP = 12
const WATERMARK_FONT_SIZE = 20
const WATERMARK_FONT_WEIGHT = 600
const WATERMARK_NAME_FONT_WEIGHT = 500
/** 品牌与水印字体族来自 Theme Token，随包自托管，不依赖宿主系统。 */
const WATERMARK_BRAND_FONT_TOKEN = '--klc-font-family-brand'
const WATERMARK_NAME_FONT_TOKEN = '--klc-font-family-brand-cjk'
/** FontFace 注册名，必须与 --klc-font-family-brand-cjk 的首选族一致。 */
const WATERMARK_CJK_FONT_FAMILY = 'HarmonyOS Sans'
let harmonyFontPromise: Promise<readonly FontFace[]> | undefined

/** 首次截图时等待随包字体就绪；字体由 fonts.css 的 @font-face 注册，这里不重复嵌入字形。 */
function loadHarmonyFont(): Promise<readonly FontFace[]> {
  harmonyFontPromise ??= document.fonts.load(
    `${WATERMARK_NAME_FONT_WEIGHT} ${WATERMARK_FONT_SIZE}px "${WATERMARK_CJK_FONT_FAMILY}"`,
  )
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

/** 按实际像素边界裁掉图层上下留白；没有任何绘制内容时视为截图失败。 */
function cropTransparentRows(image: HTMLCanvasElement, context: CanvasRenderingContext2D): void {
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
}

/**
 * 在透明画布上绘制一层水印并裁掉上下留白。
 * @param width 画布宽度
 * @param height 绘制用画布高度，裁切后以实际墨迹为准
 * @param draw 具体的绘制过程，图层内容由调用方决定
 * @returns 裁切后的水印图层
 */
function createWatermarkLayer(
  width: number,
  height: number,
  draw: (context: CanvasRenderingContext2D) => void,
): HTMLCanvasElement {
  const image = document.createElement('canvas')
  image.width = width
  image.height = height
  const context = image.getContext('2d')
  if (!context) throw new Error(chartScreenshotLabels.failed)
  draw(context)
  cropTransparentRows(image, context)
  return image
}

/**
 * 绘制居中的单行文字水印。
 * @param width 画布宽度，文字在其中居中
 * @param scale 设备像素比，用于换算字号与内边距
 * @param text 水印文字
 * @param color 文字颜色
 * @param family 字体族
 * @param weight 字重
 * @returns 裁掉上下留白后的文字图层
 */
function createWatermarkTextImage(
  width: number,
  scale: number,
  text: string,
  color: string,
  family: string,
  weight: number,
): HTMLCanvasElement {
  const fontSize = WATERMARK_FONT_SIZE * scale
  const baseline = Math.ceil(fontSize * 2)
  return createWatermarkLayer(width, Math.ceil(fontSize * 3), (context) => {
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
  })
}

/**
 * 绘制「折线标识 + 品牌文字」的整行水印：标识与文字按同一字号等比缩放并作为一组居中，
 * 标识对齐文字实际墨迹的垂直中心，避免两者分别居中后出现错位。
 * @param width 画布宽度，品牌组在其中居中
 * @param scale 设备像素比，用于换算字号与间距
 * @param text 品牌文字
 * @param color 文字与标识共用的颜色
 * @param family 品牌字体族
 * @param weight 品牌字重
 * @returns 裁掉上下留白后的品牌图层
 */
function createWatermarkBrandImage(
  width: number,
  scale: number,
  text: string,
  color: string,
  family: string,
  weight: number,
): HTMLCanvasElement {
  const fontSize = WATERMARK_FONT_SIZE * scale
  const baseline = Math.ceil(fontSize * 2)
  const markScale = (fontSize * WATERMARK_BRAND_MARK_HEIGHT_RATIO) / BRAND_MARK_VIEWBOX.height
  const markWidth = BRAND_MARK_VIEWBOX.width * markScale
  const gap = fontSize * WATERMARK_BRAND_MARK_GAP_RATIO
  return createWatermarkLayer(width, Math.ceil(fontSize * 3), (context) => {
    context.font = `${weight} ${fontSize}px ${family}`
    context.fillStyle = color
    context.strokeStyle = color
    context.textBaseline = 'alphabetic'
    context.textAlign = 'left'
    const textWidth = Math.min(
      context.measureText(text).width,
      width - WATERMARK_HORIZONTAL_PADDING * 2 * scale - markWidth - gap,
    )
    const left = (width - (markWidth + gap + textWidth)) / 2
    const metrics = context.measureText(text)
    // 品牌文字含 Q 的下伸部，墨迹中心由实际度量得出，标识据此与文字等高对齐。
    const inkCenterY =
      baseline + (metrics.actualBoundingBoxDescent - metrics.actualBoundingBoxAscent) / 2
    context.save()
    context.translate(left + markWidth / 2, inkCenterY)
    context.scale(markScale, markScale)
    context.translate(
      -(BRAND_MARK_VIEWBOX.x + BRAND_MARK_VIEWBOX.width / 2),
      -(BRAND_MARK_VIEWBOX.y + BRAND_MARK_VIEWBOX.height / 2),
    )
    context.lineWidth = BRAND_MARK_STROKE_WIDTH
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.stroke(new Path2D(BRAND_MARK_PATH))
    context.restore()
    context.fillText(text, left + markWidth + gap, baseline, textWidth)
  })
}

/** 捕获 DOM，合成带留白和独立水印页脚的完整图表，供所有导出方式共用。 */
async function createScreenshot(
  element: HTMLElement,
  symbol: string,
  name: string,
  captureFrame: ChartController['captureFrame'],
): Promise<HTMLCanvasElement> {
  const instrumentText = [name.trim(), symbol.trim()].filter(Boolean).join(WATERMARK_SEPARATOR)
  const styles = getComputedStyle(element)
  const brandFamily = styles.getPropertyValue(WATERMARK_BRAND_FONT_TOKEN).trim()
  const instrumentFamily = styles.getPropertyValue(WATERMARK_NAME_FONT_TOKEN).trim()
  const brandFont = `${WATERMARK_FONT_WEIGHT} ${WATERMARK_FONT_SIZE}px ${brandFamily}`
  const instrumentFont = `${WATERMARK_NAME_FONT_WEIGHT} ${WATERMARK_FONT_SIZE}px ${instrumentFamily}`
  // 品种信息与品牌分行呈现，字体准备完成后再绘制，避免中文使用系统替代字形。
  await Promise.all([document.fonts.load(brandFont, WATERMARK_TEXT), loadHarmonyFont()])
  await document.fonts.load(instrumentFont, instrumentText)
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
  const brand = createWatermarkBrandImage(
    result.width,
    scale,
    WATERMARK_TEXT,
    styles.getPropertyValue(WATERMARK_BRAND_TEXT_TOKEN).trim(),
    brandFamily,
    WATERMARK_FONT_WEIGHT,
  )
  const watermarkTextToken =
    styles.colorScheme === 'dark' ? WATERMARK_DARK_TEXT_TOKEN : WATERMARK_LIGHT_TEXT_TOKEN
  const instrument = createWatermarkTextImage(
    result.width,
    scale,
    instrumentText,
    styles.getPropertyValue(watermarkTextToken).trim(),
    instrumentFamily,
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
        await navigator.clipboard.write([new ClipboardItem({ [PNG_MIME_TYPE]: imagePromise })])
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
