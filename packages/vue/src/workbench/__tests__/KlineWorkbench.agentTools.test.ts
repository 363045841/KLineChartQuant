/** 工作台对外暴露的 Agent 图表工具入口：挂载期注入与挂载后补注册。 */
import { getRegisteredChartTools } from '@363045841yyt/klinechart-core/controllers'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, type PropType } from 'vue'
import KlineWorkbench from '../KlineWorkbench.vue'

const agent = vi.hoisted(() => ({
  extraChartTools: [] as Array<(() => ReadonlyArray<unknown>) | undefined>,
  registerChartTools: vi.fn(),
}))

vi.mock('../impl/useWorkbenchServices.js', () => ({
  useWorkbenchServices: () => ({ initialize: async () => undefined }),
}))
vi.mock('../../components/chart/KLineChart.vue', () => ({
  default: defineComponent({ setup: () => () => h('div', { 'data-chart': '' }) }),
}))
vi.mock('../impl/WorkbenchAgent.vue', () => ({
  __esModule: true,
  default: defineComponent({
    props: {
      extraChartTools: {
        type: Function as PropType<() => ReadonlyArray<unknown>>,
        default: undefined,
      },
    },
    setup(props, { expose, slots }) {
      agent.extraChartTools.push(props.extraChartTools)
      expose({ registerChartTools: agent.registerChartTools })
      return () => h('div', { 'data-agent': '' }, slots.default?.())
    },
  }),
}))

/** 取真实内置图表工具作为注入样本，避免替身与契约漂移。 */
function sampleTool() {
  const [tool] = getRegisteredChartTools()
  if (tool === undefined) throw new Error('内置图表工具目录为空')
  return tool
}

describe('KlineWorkbench agent tools', () => {
  it('forwards extraChartTools to the agent host and exposes late registration', async () => {
    const tool = sampleTool()
    const extraChartTools = () => [tool]
    const wrapper = mount(KlineWorkbench, { props: { extraChartTools } })
    try {
      await vi.waitFor(() => expect(agent.extraChartTools.length).toBeGreaterThan(0))
      expect(agent.extraChartTools[0]).toBe(extraChartTools)
      wrapper.vm.registerChartTools([tool])
      expect(agent.registerChartTools).toHaveBeenCalledWith([tool])
    } finally {
      wrapper.unmount()
    }
  })

  it('ignores late registration when the agent surface is disabled', async () => {
    const wrapper = mount(KlineWorkbench, { props: { agent: false } })
    try {
      expect(() => wrapper.vm.registerChartTools([sampleTool()])).not.toThrow()
      expect(agent.registerChartTools).not.toHaveBeenCalled()
    } finally {
      wrapper.unmount()
    }
  })
})
