/**
 * magnet 子模块对外契约：OHLC 磁吸档位、配置与吸附结果类型。
 *
 * 仅存放跨子模块引用或被 barrel 公开的类型；磁吸实现细节留在 impl/。
 * 本文件不得 import 同子模块 impl/。
 */

/**
 * 磁吸档位常量表：运行时设置档位、构建工具栏都必须引用这里，
 * 禁止在业务代码中散落字符串字面量。
 */
export const MagnetMode = {
  /** 关闭磁吸。 */
  Off: 'off',
  /** 吸附 high/low 两值。 */
  Weak: 'weak',
  /** 吸附 OHLC 四值。 */
  Strong: 'strong',
} as const

/** 磁吸三态，由 MagnetMode 常量派生。 */
export type MagnetMode = (typeof MagnetMode)[keyof typeof MagnetMode]

/** 生效档位（off 已在调用方过滤，进入磁吸模块的必为吸附档）。 */
export type ActiveMagnetMode = Exclude<MagnetMode, typeof MagnetMode.Off>

/** 磁吸配置：weak 限定 8px 内的 high/low，strong 始终取最近的 OHLC。 */
export interface MagnetSnapConfig {
  mode: ActiveMagnetMode
}

/** 吸附后的容器局部坐标。 */
export interface SnappedPoint {
  x: number
  y: number
}
