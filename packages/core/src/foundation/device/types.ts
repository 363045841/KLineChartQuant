/** 浏览器设备环境契约；设备类型与输入能力分别用于性能策略和交互策略。 */
export type DeviceType = 'mobile' | 'tablet' | 'desktop'

export interface DeviceEnvironment {
  /** 结算前是同步估计；resolved 为 true 后是权威设备类型。 */
  readonly deviceType: DeviceType
  readonly isCoarsePointer: boolean
  /** UA-CH formFactors 是否已结算；false 时 deviceType 只是临时估计。 */
  readonly resolved: boolean
}
