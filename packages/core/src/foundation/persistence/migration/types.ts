/**
 * IndexedDB 迁移契约：一个库的全部结构变更和数据升级都写在这里。
 *
 * 版本号只能升不能降；数据库打开时用最后一步的版本，升级事务内只执行
 * `oldVersion` 之后的步骤。
 */

/** 一次迁移；只在 versionchange 事务内执行。 */
export interface MigrationStep {
  /** 目标版本；必须大于上一步。 */
  readonly version: number
  /** 升级到该版本：建 store、建索引、回填数据都在这里完成。 */
  execute(database: IDBDatabase, transaction: IDBTransaction): void
}

/** 一个 IndexedDB 库的完整定义；库名、store 名与全部迁移只在这里出现。 */
export interface DatabaseDefinition {
  readonly name: string
  readonly storeName: string
  readonly steps: readonly MigrationStep[]
}
