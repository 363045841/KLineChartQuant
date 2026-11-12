/** 指标实例独立价格轴的偏好键；轴解析与实例删除必须共用同一格式。 */
export function indicatorInstanceAxisKey(instanceId: string): string {
  return `instance:${instanceId}`
}
