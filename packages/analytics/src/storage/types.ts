/**
 * 按天分片存储契约。
 *
 * 存储形态：`<rootDir>/<stream>/<YYYY-MM-DD>.jsonl.gz`，一个 UTC 天一个 gzip 分片。
 * 命名规则固定，路径即索引：备份、清理、按天回读都不需要额外元数据。
 */

/** 一次追加请求。 */
export interface DayAppendRequest<T> {
  /** 流标识，用 `/` 分层，例如 `options/aggregate/BTC` */
  readonly stream: string
  /** 待写入记录 */
  readonly rows: readonly T[]
  /** 取记录所属 UTC 天的毫秒时间戳 */
  readonly dayOf: (row: T) => number
  /** 去重键：同一天分片里已存在的键会被跳过，保证重复采集不产生重复行 */
  readonly dedupeKey: (row: T) => string
}

/** 单个分片的追加结果。 */
export interface DayAppendResult {
  /** 流标识 */
  readonly stream: string
  /** UTC 日期 `YYYY-MM-DD` */
  readonly day: string
  /** 实际写入条数 */
  readonly appended: number
  /** 因重复而跳过的条数 */
  readonly skipped: number
  /** 分片文件绝对路径 */
  readonly path: string
}

/** 分片存储接口。存储层不解释记录字段，只负责序列化、去重与按天落盘。 */
export interface DayShardStore {
  /**
   * 追加记录，按每条记录的 UTC 天写入对应分片。
   *
   * @param request 追加请求
   * @returns 每个受影响分片的写入结果
   */
  readonly append: <T>(request: DayAppendRequest<T>) => readonly DayAppendResult[]

  /**
   * 读回某天的全部记录。
   *
   * @param request 流标识与 UTC 日期
   * @returns 记录数组，按写入顺序
   */
  readonly read: <T>(request: { readonly stream: string; readonly day: string }) => readonly T[]

  /**
   * 列出某条流已有的全部日期分片（升序）。
   *
   * @param stream 流标识
   * @returns `YYYY-MM-DD` 数组
   */
  readonly listDays: (stream: string) => readonly string[]

  /**
   * 删除早于指定日期的分片，用于滚动保留期。
   *
   * @param request 流标识与截止日期（不含）
   * @returns 被删除的日期数组
   */
  readonly purgeBefore: (request: {
    readonly stream: string
    readonly beforeDay: string
  }) => readonly string[]
}
