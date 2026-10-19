/** 图例操作按钮投影：脚本指标额外提供代码编辑入口。 */
import { describe, expect, it } from 'vitest'
import type { LegendEntry } from '../types'
import { projectLegendActions } from '../impl/projectLegendActions'

describe('projectLegendActions', () => {
  const entry: LegendEntry = {
    id: 'main:Script',
    kind: 'indicator',
    paneId: 'main',
    definitionId: 'Script',
    params: {},
    hidden: false,
  }

  it('脚本指标提供代码编辑按钮，普通指标不提供', () => {
    const actions = (isScript: boolean) =>
      projectLegendActions(entry, ['main'], () => isScript).map((item) => item.action)

    expect(actions(true)).toContain('edit-code')
    expect(actions(false)).not.toContain('edit-code')
  })
})
