/** 浏览器宿主在导入图表前配置持久化命名空间；运行期间保持不可变。 */
let namespace = ''
let claimed = false

/** 设置用户/工作区范围；切换范围必须刷新页面，避免模块级缓存与延迟写入串租户。 */
export function configureBrowserPersistenceScope(scope: string): void {
  if (!scope.trim()) throw new Error('Persistence scope must not be empty')
  if (claimed && scope !== namespace)
    throw new Error('Reload the page before changing persistence scope')
  namespace = scope
}

/** 绑定当前范围并返回独立存储名称；旧实例始终保留创建时的名称。 */
export function scopedPersistenceName(name: string): string {
  claimed = true
  return namespace ? `kcq:${encodeURIComponent(namespace)}:${name}` : name
}
