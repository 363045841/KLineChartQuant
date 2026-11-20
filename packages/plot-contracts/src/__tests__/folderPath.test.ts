/** 文件夹路径规则：脚本仓库、持久化与文件树共用同一份实现。 */
import { describe, expect, it } from 'vitest'
import { isWithinFolder, normalizeFolderPath, parentFolderPath } from '../folderPath.js'

describe('文件夹路径', () => {
  it.each([
    { input: '', expected: '' },
    { input: '策略/均线', expected: '策略/均线' },
  ])('规范化合法路径：$input', ({ input, expected }) => {
    expect(normalizeFolderPath(input)).toBe(expected)
  })

  it.each(['/', 'a//b', '/a', 'a/', ' a', 'a '])('拒绝空段或首尾空白：%s', (path) => {
    expect(() => normalizeFolderPath(path)).toThrow('文件夹名称无效')
  })

  it.each([
    ['', ''],
    ['策略', ''],
    ['策略/均线', '策略'],
    ['a/b/c', 'a/b'],
  ])('父目录 %s -> %s', (path, expected) => {
    expect(parentFolderPath(path)).toBe(expected)
  })

  it('目录包含自身与下级，不含仅有相同前缀的兄弟目录', () => {
    expect(isWithinFolder('策略', '策略')).toBe(true)
    expect(isWithinFolder('策略/均线', '策略')).toBe(true)
    expect(isWithinFolder('策略二号', '策略')).toBe(false)
  })
})
