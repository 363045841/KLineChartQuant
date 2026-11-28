/**
 * 线程内的消息端点。
 *
 * 浏览器入口用 Worker 全局实现，Node 入口用 `parentPort` 实现；线程内逻辑只依赖这组方法。
 */
export interface WorkerEndpoint {
  onMessage(listener: (data: unknown) => void): void
  postMessage(message: unknown, transfer?: readonly ArrayBuffer[]): void
}
