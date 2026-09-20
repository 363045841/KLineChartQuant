/**
 * 自定义 Marker 测试夹具。
 */

import type { CustomMarkerEntity } from '../../registry'

/**
 * 构造测试用 CustomMarkerEntity，默认日期 2025-01-15、圆形。
 * @param id Marker id。
 * @param overrides 需要覆盖的字段。
 * @returns 测试用 CustomMarkerEntity。
 */
export function createCustomMarker(
  id: string,
  overrides: Partial<CustomMarkerEntity> = {},
): CustomMarkerEntity {
  return {
    id,
    date: '2025-01-15',
    timestamp: Date.UTC(2025, 0, 15, -8, 0, 0, 0),
    shape: 'circle',
    ...overrides,
  }
}
