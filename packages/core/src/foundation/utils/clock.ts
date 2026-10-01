/** 帧时间的可注入来源，统一使用 Unix 毫秒。 */
export interface Clock {
  /** 读取当前 Unix 毫秒时间。 */
  now(): number
}

/** 生产环境时间源；业务帧只在开始时读取一次。 */
export const systemClock: Clock = {
  now: () => Date.now(),
}
