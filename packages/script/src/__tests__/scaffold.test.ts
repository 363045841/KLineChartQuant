/**
 * 脚手架占位用例：验证包入口可被导入、测试环境可正常运行
 * 业务用例落地后应移除本文件
 */
import { describe, expect, it } from 'vitest'

describe('klinechart-script scaffold', () => {
  it('loads the package entry without a DOM environment', async () => {
    const mod = await import('../index.js')
    expect(mod).toBeDefined()
  })
})
