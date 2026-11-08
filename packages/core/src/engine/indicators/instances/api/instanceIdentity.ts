// 指标实例创建入口共用的身份分配规则；消费层不得据定义或位置重新推导实例 ID。
import { generateUUID } from '../../../../foundation/utils/uuid.js'

/**
 * 为新建的指标实例分配不依赖定义和位置的身份。
 *
 * 主图与副图共用同一规则：允许同一指标多次添加后，实例之间只能靠身份区分，
 * 由定义派生的 ID（如 `main:<定义>`）会让第二个实例覆盖第一个。
 */
export function createIndicatorInstanceId(): string {
  return generateUUID()
}
