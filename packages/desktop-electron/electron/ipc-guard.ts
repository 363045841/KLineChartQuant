/**
 * 主进程 IPC 的统一来源门禁。
 *
 * 所有面向渲染进程的通道都只接受「主窗口主 frame」的调用：其它窗口、被嵌入的
 * iframe、以及伪造来源一律拒绝。集中在这里实现，避免每个模块各写一份判断后慢慢漂移。
 */

/** 门禁需要的最小事件形状；`IpcMainInvokeEvent` 结构上可直接传入。 */
export interface TrustedIpcEvent {
  /** 发起 IPC 的 webContents，由调用方与主窗口比对。 */
  readonly sender: unknown
  /** frame 树；存在 parent 说明是子 frame。 */
  readonly senderFrame?: { readonly parent?: unknown } | null
}

const MAIN_FRAME_ONLY = 'IPC is only available to the main application frame.'

/**
 * 生成来源校验函数。
 * @param isTrustedSender 调用方提供的主窗口判定（通常是 webContents 比对）
 * @returns 校验函数；来源不满足条件时抛出固定错误
 */
export function createMainFrameGuard<TEvent extends TrustedIpcEvent>(
  isTrustedSender: (event: TEvent) => boolean,
): (event: TEvent) => void {
  return (event) => {
    if (!isTrustedSender(event) || event.senderFrame?.parent) {
      throw new Error(MAIN_FRAME_ONLY)
    }
  }
}
