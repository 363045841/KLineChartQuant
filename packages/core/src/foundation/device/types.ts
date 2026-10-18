/** 浏览器设备环境契约；设备类型与输入能力分别用于性能策略和交互策略。 */
export type DeviceType = 'mobile' | 'tablet' | 'desktop'

export interface DeviceEnvironment {
  readonly deviceType: DeviceType
  readonly isCoarsePointer: boolean
}
