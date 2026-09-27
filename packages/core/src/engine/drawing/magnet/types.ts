/**
 * magnet 子模块对外契约：OHLC 磁吸档位、配置与吸附结果类型。
 *
 * 仅存放跨子模块引用或被 barrel 公开的类型；磁吸实现细节留在 impl/。
 * 本文件不得 import 同子模块 impl/。
 */

/** 磁吸三态：off 关闭，weak 吸高低点，strong 吸 OHLC 四值。 */
export type MagnetMode = 'off' | 'weak' | 'strong'

/** 生效档位（off 已在调用方过滤，进入磁吸模块的必为吸附档）。 */
export type ActiveMagnetMode = Exclude<MagnetMode, 'off'>

/** 磁吸配置：weak 限定 8px 内的 high/low，strong 始终取最近的 OHLC。 */
export interface MagnetSnapConfig {
  mode: ActiveMagnetMode
}

/** 吸附后的容器局部坐标。 */
export interface SnappedPoint {
  x: number
  y: number
}
