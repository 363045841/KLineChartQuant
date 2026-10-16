// 指标实例创建入口共用的身份分配规则；消费层不得据定义或位置重新推导实例 ID。
import { generateUUID } from '../../../../foundation/utils/uuid.js'

/** 为新建的普通指标实例分配不依赖定义和位置的身份。 */
export function createIndicatorInstanceId(): string {
  return generateUUID()
}

/** 为新建的单例主图指标分配身份，已有实例必须保留原 ID。 */
export function createMainIndicatorInstanceId(definitionId: string): string {
  return `main:${definitionId}`
}
