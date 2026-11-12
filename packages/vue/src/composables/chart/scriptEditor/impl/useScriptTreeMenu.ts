/** 文件树菜单的唯一配置；菜单状态交给 ScriptContextMenu 渲染。 */
import { onScopeDispose, type Ref } from 'vue'
import type { ScriptTreeAction, ScriptTreeRow } from '../types.js'
import { createScriptMenuModel, type ScriptMenuModel } from './scriptMenuModel.js'

interface MenuActions {
  apply(action: ScriptTreeAction): void
  writable(): boolean
  readonly treeHost: Readonly<Ref<HTMLElement | null>>
}
interface Entry {
  label: string
  disabled: string
  separatorBefore?: boolean
  run(): void
}

function menuEntries(
  row: ScriptTreeRow,
  menu: ScriptMenuModel,
  actions: MenuActions,
): readonly Entry[] {
  const blocked = actions.writable() ? '' : '正在保存或执行，请稍后重试'
  const folder = row.type === 'folder' ? row.path : row.folder
  const apply = (action: ScriptTreeAction) => {
    actions.apply(action)
    menu.close()
  }
  const create: Entry[] = [
    {
      label: '新建文件',
      disabled: blocked,
      run: () => apply({ type: 'create-file', kind: row.kind, folder }),
    },
    {
      label: '新建文件夹',
      disabled: blocked,
      run: () =>
        menu.input({
          label: '新建文件夹',
          value: '',
          validate: (name) => (name.includes('/') ? '文件夹名称不能包含 /' : null),
          submit: (name) =>
            actions.apply({
              type: 'create-folder',
              kind: row.kind,
              path: folder ? `${folder}/${name}` : name,
            }),
        }),
    },
  ]
  if (row.type === 'folder')
    return [
      ...create,
      {
        label: '删除文件夹',
        disabled: row.path === '' ? '分组根目录不能删除' : blocked,
        run: () =>
          menu.confirm({
            text: `删除文件夹「${row.name}」及其中的内容？`,
            confirmLabel: '删除文件夹',
            onConfirm: () =>
              actions.apply({ type: 'remove-folder', kind: row.kind, path: row.path }),
          }),
      },
    ]
  const target = row.target
  const draftBlocked = target.kind === 'draft' ? '未保存的草稿，请先保存' : ''
  return [
    ...create,
    {
      label: '复制文件',
      separatorBefore: true,
      disabled: blocked || draftBlocked,
      run: () => {
        if (target.kind === 'document') apply({ type: 'copy-file', id: target.documentId })
      },
    },
    {
      label: '删除文件',
      disabled: row.readonly ? '内置脚本只读，无法删除' : blocked || draftBlocked,
      run: () => {
        if (target.kind === 'document') apply({ type: 'delete-file', id: target.documentId })
      },
    },
  ]
}

export function useScriptTreeMenu(actions: MenuActions) {
  const menu = createScriptMenuModel()

  function openContextMenu(event: MouseEvent, row: ScriptTreeRow): void {
    event.preventDefault()
    event.stopPropagation()
    if (!actions.treeHost.value) return
    menu.open(event.clientX, event.clientY, { role: 'menu', label: '脚本文件菜单' })
    for (const entry of menuEntries(row, menu, actions)) {
      if (entry.separatorBefore) menu.separator()
      menu.button(entry.label, entry.run, { disabled: !!entry.disabled, reason: entry.disabled })
    }
  }

  onScopeDispose(() => {
    menu.destroy()
  })
  return { menu, openContextMenu }
}
