// 指标实例创建入口共用的身份分配规则；消费层不得据定义或位置重新推导实例 ID。
import { generateUUID } from '../../../../foundation/utils/uuid.js'

/** 为新建的普通指标实例分配不依赖定义和位置的身份。 */
export function createIndicatorInstanceId(): string {
  return generateUUID()
}
