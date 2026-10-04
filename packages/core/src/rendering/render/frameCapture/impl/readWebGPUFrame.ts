/** WebGPU 帧读取：复制纹理、移除行对齐填充并转换为 Canvas 可用的 RGBA 像素。 */
import { GENERIC_ERROR_CODES, KLineChartError } from '../../../../errors.js'
import { GPU_BUFFER_COPY_DST, GPU_BUFFER_MAP_READ, GPU_MAP_READ } from '../../webgpuGlobals.js'
import type { WebGPUFrameCaptureOptions } from '../types.js'

const BYTES_PER_PIXEL = 4
const COPY_ROW_ALIGNMENT = 256
const MAX_CHANNEL_VALUE = 255
const RGBA_FORMAT = 'rgba8unorm'
const BGRA_FORMAT = 'bgra8unorm'

/** 读取当前帧纹理；copy 在首次 await 前提交，确保不会读取呈现后的新纹理。 */
export async function readWebGPUFrame(
  options: WebGPUFrameCaptureOptions,
): Promise<HTMLCanvasElement> {
  const { device, texture, format, width, height } = options
  if (format !== RGBA_FORMAT && format !== BGRA_FORMAT) {
    throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_STATE, 'WebGPU 截图纹理格式不受支持')
  }
  const rowBytes = width * BYTES_PER_PIXEL
  const bytesPerRow = Math.ceil(rowBytes / COPY_ROW_ALIGNMENT) * COPY_ROW_ALIGNMENT
  const buffer = device.createBuffer({
    size: bytesPerRow * height,
    usage: GPU_BUFFER_COPY_DST | GPU_BUFFER_MAP_READ,
  })
  try {
    const encoder = device.createCommandEncoder()
    encoder.copyTextureToBuffer(
      { texture },
      { buffer, bytesPerRow, rowsPerImage: height },
      { width, height, depthOrArrayLayers: 1 },
    )
    device.queue.submit([encoder.finish()])
    await buffer.mapAsync(GPU_MAP_READ)
    const mapped = new Uint8Array(buffer.getMappedRange())
    const pixels = new Uint8ClampedArray(width * height * BYTES_PER_PIXEL)
    const redOffset = format === BGRA_FORMAT ? 2 : 0
    const blueOffset = format === BGRA_FORMAT ? 0 : 2
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const sourceOffset = y * bytesPerRow + x * BYTES_PER_PIXEL
        const targetOffset = (y * width + x) * BYTES_PER_PIXEL
        const alpha = mapped[sourceOffset + 3]!
        // GPU 表面使用预乘透明度；ImageData 需要非预乘颜色，否则半透明线条会变暗。
        const factor = alpha === 0 ? 0 : MAX_CHANNEL_VALUE / alpha
        pixels[targetOffset] = Math.round(mapped[sourceOffset + redOffset]! * factor)
        pixels[targetOffset + 1] = Math.round(mapped[sourceOffset + 1]! * factor)
        pixels[targetOffset + 2] = Math.round(mapped[sourceOffset + blueOffset]! * factor)
        pixels[targetOffset + 3] = alpha
      }
    }
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) {
      throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_STATE, '截图画布初始化失败')
    }
    context.putImageData(new ImageData(pixels, width, height), 0, 0)
    return canvas
  } finally {
    if (buffer.mapState === 'mapped') buffer.unmap()
    buffer.destroy()
  }
}
