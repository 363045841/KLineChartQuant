/** 生成文件写入助手：内容一致时不写盘，check 模式只校验不修改。 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/**
 * 写入生成文件；内容未变化时不触碰磁盘，避免触发无意义的文件监听。
 * @param filename 目标文件绝对路径
 * @param content 期望内容
 * @param options check 为 true 时发现差异直接报错
 * @returns 是否发生写入
 */
export function writeGeneratedFile(filename, content, { check = false } = {}) {
  const previous = existsSync(filename) ? readFileSync(filename, 'utf8') : undefined
  if (previous === content) return false
  if (check) throw new Error(`生成物已过期：${filename}，请运行生成器更新`)
  mkdirSync(path.dirname(filename), { recursive: true })
  writeFileSync(filename, content, 'utf8')
  return true
}
