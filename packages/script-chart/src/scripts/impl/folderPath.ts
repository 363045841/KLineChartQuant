/** 文件夹路径的唯一校验：所有写入与读取边界共用这一份规则。 */

/**
 * 规范化文件夹路径。
 *
 * @param path 以 / 分隔的层级路径
 * @returns 去掉逐段空白后的规范路径
 * @throws 任一段为空或首尾带空白时拒绝
 */
export function normalizeFolderPath(path: string): string {
  const segments = path.split('/')
  if (!segments.length || segments.some((segment) => !segment || segment !== segment.trim())) {
    throw new Error(`文件夹名称无效：${path}`)
  }
  return segments.join('/')
}

/** 返回父目录，一级目录的父目录为根路径。 */
export function parentFolderPath(path: string): string {
  const separator = path.lastIndexOf('/')
  return separator < 0 ? '' : path.slice(0, separator)
}

/** 目录包含自身及所有下级目录，不匹配仅有相同名称前缀的兄弟目录。 */
export function isWithinFolder(path: string, folder: string): boolean {
  return path === folder || path.startsWith(`${folder}/`)
}
