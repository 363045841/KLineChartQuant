/** WebGPU 截图读取依赖，调用发生在当前帧纹理仍有效时。 */
export interface WebGPUFrameCaptureOptions {
  readonly device: GPUDevice
  readonly texture: GPUTexture
  readonly format: GPUTextureFormat
  readonly width: number
  readonly height: number
}
