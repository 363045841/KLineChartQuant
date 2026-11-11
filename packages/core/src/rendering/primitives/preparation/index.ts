/** 原语准备入口：按有序批次生成 GPU 缓冲，形状、描边和网格各自管理写入与复用。 */
export { createPrimitivePreparer } from './impl/prepare.js'
export type { GeometryPrimitive, PreparedBatch } from './types.js'
