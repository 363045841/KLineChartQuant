/** 脚本菜单状态机：条目执行、输入校验、确认与异步失效。 */

import { describe, expect, it, vi } from 'vitest'
import { createScriptMenuModel } from '../impl/scriptMenuModel.js'

describe('脚本菜单模型', () => {
  it('菜单项按分隔线切组，执行失败把原因写回菜单', async () => {
    const menu = createScriptMenuModel()
    menu.open(10, 20, { label: '脚本文件菜单' })
    menu.button('新建文件', () => {})
    menu.separator()
    menu.button('删除文件', () => Promise.reject(new Error('目录只读')))
    const state = menu.state.value
    const items = state?.content.kind === 'menu' ? state.content.items : []
    expect(state?.label).toBe('脚本文件菜单')
    expect(items[1]?.separatorBefore).toBe(true)
    await menu.run(items[1]!.id)
    expect(menu.state.value?.content).toEqual({ kind: 'message', text: '目录只读' })
  })

  it('输入校验失败保留内容，成功后关闭菜单', async () => {
    const menu = createScriptMenuModel()
    const submit = vi.fn().mockResolvedValue(undefined)
    menu.open(0, 0)
    menu.input({
      label: '新建文件夹',
      value: '',
      submit,
      validate: (name) => (name.includes('/') ? '名称不能包含 /' : null),
    })
    await menu.submitInput('a/b')
    expect(menu.state.value?.content).toMatchObject({ kind: 'input', error: '名称不能包含 /' })
    expect(submit).not.toHaveBeenCalled()
    await menu.submitInput(' 策略 ')
    expect(submit).toHaveBeenCalledWith('策略')
    expect(menu.state.value).toBeNull()
  })

  it('确认失败保留菜单，关闭后异步结果失效', async () => {
    const menu = createScriptMenuModel()
    menu.open(0, 0)
    menu.confirm({
      text: '删除文件夹？',
      confirmLabel: '删除',
      onConfirm: () => Promise.reject(new Error('失败')),
    })
    await menu.confirmAction()
    expect(menu.state.value?.content).toMatchObject({ kind: 'confirm', error: '失败' })
    const generation = menu.generation
    menu.close()
    expect(menu.generation).toBeGreaterThan(generation)
    expect(menu.state.value).toBeNull()
  })

  it('声明预览使用 dialog 语义并保留路径', () => {
    const menu = createScriptMenuModel()
    menu.open(0, 0)
    menu.preview({ path: 'lib.ts', source: 'export {}', from: 0, to: 6 })
    const state = menu.state.value
    expect(state?.role).toBe('dialog')
    expect(state?.label).toBe('声明预览')
    expect(state?.content.kind === 'preview' && state.content.preview.path).toBe('lib.ts')
  })
})
