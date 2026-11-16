/**
 * 期权数据的层与路径映射：一个层对应哪个流，只在这里定义一次。
 *
 * 布局（相对数据根目录）：
 *   options/aggregate/<CUR>/YYYY-MM-DD.jsonl.gz        分钟行（聚合流根目录就是分钟层）
 *   options/aggregate/<CUR>/hourly/YYYY-MM-DD.jsonl.gz 小时行，边界快照
 *   options/aggregate/<CUR>/daily/YYYY-MM-DD.jsonl.gz  日行，边界快照
 *   options/chain/<CUR>/YYYY-MM-DD.jsonl.gz            原始链，90 天滚动
 *
 * 分钟层不加 `minute/` 层级：采集器已经在写根目录，加一层就要先重建 NAS 容器再迁移
 * 历史文件，迁移完成前服务只能读到空目录；而目录层级本身不承载任何计算口径。
 */

/** 聚合位流的根前缀。 */
export const OPTION_AGGREGATE_STREAM_PREFIX = 'options/aggregate'

/** 原始链流前缀。 */
export const OPTION_CHAIN_STREAM_PREFIX = 'options/chain'

/** 数据层：分钟、小时、日。 */
export type OptionLayer = 'minute' | 'hourly' | 'daily'

/** 对外接口用的步长名到数据层的映射：`hour`/`day` 是查询参数，`hourly`/`daily` 是目录。 */
export const OPTION_STEP_LAYERS: Readonly<Record<string, OptionLayer>> = {
  minute: 'minute',
  hour: 'hourly',
  day: 'daily',
}

/** 除分钟层之外，各层在聚合流下的子目录名。 */
const LAYER_DIRS: Readonly<Record<Exclude<OptionLayer, 'minute'>, string>> = {
  hourly: 'hourly',
  daily: 'daily',
}

/**
 * 取某个标的某一层的流标识。
 *
 * @param currency 期权标的（调用方已校验格式）
 * @param layer 数据层
 * @returns 流标识
 */
export function optionLayerStream(currency: string, layer: OptionLayer): string {
  const root = `${OPTION_AGGREGATE_STREAM_PREFIX}/${currency}`
  return layer === 'minute' ? root : `${root}/${LAYER_DIRS[layer]}`
}

/**
 * 取某个标的的原始链流标识。
 *
 * @param currency 期权标的
 * @returns 流标识
 */
export function optionChainStream(currency: string): string {
  return `${OPTION_CHAIN_STREAM_PREFIX}/${currency}`
}
