/**
 * 原始链的采样节奏：只有落在采样分钟的轮次才落链。
 *
 * 采集器每轮起一个新进程（`collector.sh` 在 shell 层 sleep），进程内计数无法跨轮，
 * 所以节奏由采集时刻本身决定：自 epoch 起的分钟数能被 everyMinutes 整除即采样分钟。
 * 这样不需要状态文件，重启、补跑、多进程都不改变口径，也不受每轮耗时漂移影响而改变相位。
 */

/** 一分钟的毫秒数。 */
const MINUTE_MS = 60_000

/**
 * 判断某个采集时刻是否落在采样分钟上。
 *
 * @param capturedAt 采集时刻（毫秒）
 * @param everyMinutes 采样间隔（分钟）；调用方保证为不小于 1 的整数
 * @returns 是否落链
 */
export function isChainCaptureMinute(capturedAt: number, everyMinutes: number): boolean {
  return Math.floor(capturedAt / MINUTE_MS) % everyMinutes === 0
}
