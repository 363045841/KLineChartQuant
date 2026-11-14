/**
 * 指标开关：关闭必须按定义删除全部实例，打开按定义声明放置。
 *
 * 覆盖的回归场景：脚本把 position 从副图改成主图后，旧存档里的实例仍带 sub 角色，
 * 按 role 过滤会让开关既关不掉、也再回不到主图（真机表现为图形长期留在底部副图）。
 */
import { registerIndicators } from '@363045841yyt/klinechart-core'
import { MAIN_PANE_ID } from '@363045841yyt/klinechart-core/controllers'
import type { IndicatorInstance, SubPaneInfo } from '@363045841yyt/klinechart-core/controllers'
import { createMockChartController } from '@vue-src/__tests__/_mockController'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { ref, shallowRef } from 'vue'
import { useIndicatorManager } from '../useIndicatorManager'

/** 主图类定义与副图类定义各注册一条目录项，开关只读这个静态目录。 */
const MAIN_DEFINITION = 'TOGGLE-MAIN'
const SUB_DEFINITION = 'TOGGLE-SUB'

beforeAll(() => {
  registerIndicators([
    {
      kind: 'descriptor',
      candidate: { key: MAIN_DEFINITION, origin: 'third-party', identity: 'native' },
      descriptor: {
        name: MAIN_DEFINITION,
        displayName: '开关主图指标',
        category: 'main',
        defaultPaneId: MAIN_PANE_ID,
      },
    },
    {
      kind: 'descriptor',
      candidate: { key: SUB_DEFINITION, origin: 'third-party', identity: 'native' },
      descriptor: {
        name: SUB_DEFINITION,
        displayName: '开关副图指标',
        category: 'sub',
        defaultPaneId: 'sub_toggle',
      },
    },
  ])
})

/** 构造一条实例；只看开关关心的字段。 */
function createInstance(
  id: string,
  definitionId: string,
  role: IndicatorInstance['role'],
  paneId: string,
): IndicatorInstance {
  return {
    id,
    definitionId,
    label: definitionId,
    name: definitionId,
    role,
    paneId,
    ordinal: 0,
    params: {},
  }
}

/** 构造一条副图信息，用于副图上限与“已存在”分支。 */
function createSubPaneInfo(instanceId: string, paneId: string, indicatorId: string): SubPaneInfo {
  return { instanceId, paneId, indicatorId, ordinal: 0, params: {}, ratio: 1 }
}

/** 装配控制器替身与命令面 spy；只断言命令面入参，不模拟布局推导。 */
function createFixture(
  instances: ReadonlyArray<IndicatorInstance> = [],
  subPaneInfos: ReadonlyArray<SubPaneInfo> = [],
) {
  const controller = createMockChartController()
  controller._setIndicators(instances)
  controller._setSubPanes(subPaneInfos)
  const addIndicator = vi.spyOn(controller, 'addIndicator').mockReturnValue('new-instance')
  const removeIndicator = vi.spyOn(controller, 'removeIndicator').mockReturnValue(true)
  const loadIndicators = vi.spyOn(controller, 'loadIndicators').mockResolvedValue()
  const manager = useIndicatorManager(shallowRef(controller), ref({}))
  return { controller, addIndicator, removeIndicator, loadIndicators, manager }
}

describe('指标开关', () => {
  it('关闭主图类指标时删除留在副图上的旧实例，不按 role 漏删', async () => {
    const fixture = createFixture([
      createInstance('stale', MAIN_DEFINITION, 'sub', 'pane-legacy'),
    ])

    await fixture.manager.handleIndicatorToggle(MAIN_DEFINITION, false)

    expect(fixture.removeIndicator).toHaveBeenCalledExactlyOnceWith('stale')
  })

  it('关闭主图类指标时删除该定义的全部实例', async () => {
    const fixture = createFixture([
      createInstance('main-instance', MAIN_DEFINITION, 'main', MAIN_PANE_ID),
      createInstance('stale', MAIN_DEFINITION, 'sub', 'pane-legacy'),
      createInstance('other', SUB_DEFINITION, 'sub', 'pane-sub'),
    ])

    await fixture.manager.handleIndicatorToggle(MAIN_DEFINITION, false)

    expect(fixture.removeIndicator.mock.calls).toEqual([['main-instance'], ['stale']])
  })

  it('关闭副图类指标时按实例删除，空副图由实例删除回收', async () => {
    const fixture = createFixture(
      [createInstance('sub-instance', SUB_DEFINITION, 'sub', 'pane-sub')],
      [createSubPaneInfo('sub-instance', 'pane-sub', SUB_DEFINITION)],
    )

    await fixture.manager.handleIndicatorToggle(SUB_DEFINITION, false)

    expect(fixture.removeIndicator).toHaveBeenCalledExactlyOnceWith('sub-instance')
  })

  it('打开主图类指标且没有实例时新建，不指定目标面板', async () => {
    const fixture = createFixture()

    await fixture.manager.handleIndicatorToggle(MAIN_DEFINITION, true)

    expect(fixture.addIndicator).toHaveBeenCalledExactlyOnceWith(MAIN_DEFINITION, undefined)
    expect(fixture.loadIndicators).toHaveBeenCalledExactlyOnceWith([MAIN_DEFINITION])
  })

  it.each([
    ['主图实例', createInstance('main-instance', MAIN_DEFINITION, 'main', MAIN_PANE_ID)],
    ['副图旧实例', createInstance('stale', MAIN_DEFINITION, 'sub', 'pane-legacy')],
  ])('打开主图类指标且已有%s时不重复新建', async (_label, instance) => {
    const fixture = createFixture([instance])

    await fixture.manager.handleIndicatorToggle(MAIN_DEFINITION, true)

    expect(fixture.addIndicator).not.toHaveBeenCalled()
    expect(fixture.loadIndicators).not.toHaveBeenCalled()
  })

  it('副图数量达到上限后不再新增副图类指标', async () => {
    const fixture = createFixture(
      [],
      Array.from({ length: 4 }, (_, index) =>
        createSubPaneInfo(`pane-${index}`, `pane-${index}`, `OTHER-${index}`),
      ),
    )

    await fixture.manager.handleIndicatorToggle(SUB_DEFINITION, true)

    expect(fixture.addIndicator).not.toHaveBeenCalled()
  })
})
