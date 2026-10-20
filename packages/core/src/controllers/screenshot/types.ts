/** 截图只消费 Scene 已合成的原生 Canvas，不存在替换 GPU surface 的第二条路径。 */
export interface ChartFrameCaptureContext {
  readonly dpr: number
}
