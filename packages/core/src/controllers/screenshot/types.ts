/** 截图帧契约：引擎提供像素比例和 GPU 快照，宿主负责 DOM 合成与图片排版。 */
export interface ChartFrameCaptureContext {
  /** 本次完整绘制帧使用的引擎 DPR。 */
  readonly dpr: number
  /** Canvas2D 后端没有独立 GPU 表面。 */
  readonly surface: {
    readonly source: HTMLCanvasElement
    /** 在帧结束时发起的原始物理像素快照。 */
    readonly image: Promise<HTMLCanvasElement>
  } | null
}
