/** 警报面板：全量分组、折叠与参数命令。 */
import { createAlertCatalog } from '@363045841yyt/klinechart-core/controllers'
import { describe, expect, it } from 'vitest'
import {
  projectAlertRule,
  useAlertPanel,
} from '@vue-src/composables/alerts/useAlertPanel.js'
import {
  createAlertTestContext,
  CURRENT,
  draft,
  ETH,
  settle,
} from './helpers/alertTestKit.js'
import { effectScope } from 'vue'

async function setup() {
  const context = createAlertTestContext()
  context.registerScript()
  const backend = await context.createBackend()
  const scope = effectScope()
  const panel = scope.run(() =>
    useAlertPanel({
      alerts: () => backend.service,
      definitions: context.definitions,
    }),
  )
  if (!panel) throw new Error('Alert panel scope did not run')
  return {
    service: backend.service,
    panel,
    definitions: context.definitions,
    async dispose() {
      scope.stop()
      await backend.dispose()
    },
  }
}

describe('useAlertPanel', () => {
  it('groups every rule by instrument and keeps disabled rules visible', async () => {
    const { service, panel, dispose } = await setup()
    try {
      const btc = service.create(draft(CURRENT))
      service.create(draft({ instrument: ETH, period: '1min', adjust: 'none' }, 'ETH 穿越'))
      service.setEnabled(btc.id, false)
      await settle()

      expect(panel.groups.value.map((group) => group.instrument.symbol)).toEqual([
        'BTCUSDT',
        'ETHUSDT',
      ])
      expect(panel.groups.value[0]?.rules).toHaveLength(1)
      expect(panel.groups.value.flatMap((group) => group.rules)).toHaveLength(2)
    } finally {
      await dispose()
    }
  })

  it('collapses a group without dropping its rules', async () => {
    const { service, panel, dispose } = await setup()
    try {
      service.create(draft(CURRENT))
      await settle()
      const group = panel.groups.value[0]
      if (!group) throw new Error('Missing alert group')

      expect(panel.isCollapsed(group.key)).toBe(false)
      panel.toggleGroup(group.key)
      expect(panel.isCollapsed(group.key)).toBe(true)
      expect(group.rules).toHaveLength(1)

      panel.toggleGroup(group.key)
      expect(panel.isCollapsed(group.key)).toBe(false)
    } finally {
      await dispose()
    }
  })

  it('edits parameters through the shared dialog values', async () => {
    const { service, panel, dispose } = await setup()
    try {
      const rule = service.create(draft(CURRENT))
      await settle()
      panel.openParams(rule)
      expect(panel.paramsScript.value?.id).toBe('PriceCross')
      expect(panel.paramsValues.value).toEqual({ price: 100 })

      panel.confirmParams({ price: 120 })
      await settle()
      expect(service.get(rule.id)?.script.inputs).toEqual({ price: 120 })
      expect(panel.paramsVisible.value).toBe(false)
    } finally {
      await dispose()
    }
  })

  it('projects group and rule labels from the shared catalog', async () => {
    const { service, panel, dispose } = await setup()
    try {
      service.create(draft(CURRENT))
      await settle()
      const group = panel.groups.value[0]
      if (!group) throw new Error('Missing alert group')

      expect(group.label).toBe('BTCUSDT · SZ')
      expect(group.rules[0]?.label).toBe('价格穿越')
    } finally {
      await dispose()
    }
  })

  it.each([
    { name: 'ready', mode: 'keep', state: 'ready', hint: '编辑参数' },
    { name: 'no-params', mode: 'no-params', state: 'no-params', hint: '该脚本没有参数' },
    { name: 'no-script', mode: 'no-script', state: 'no-script', hint: '脚本不可用' },
  ] as const)('projects the $name params entry', async ({ mode, state, hint }) => {
    const { service, definitions, dispose } = await setup()
    try {
      const rule = service.create(draft(CURRENT))
      await settle()
      const script = createAlertCatalog(definitions)().find((item) => item.id === 'PriceCross')
      if (mode !== 'no-script' && !script) throw new Error('Missing test script')
      const scripts =
        mode === 'no-script' || !script
          ? []
          : [{ ...script, ...(mode === 'no-params' ? { inputs: [] } : {}) }]

      const row = projectAlertRule(rule, scripts)
      expect(row.paramsState).toBe(state)
      expect(row.paramsHint).toBe(hint)
    } finally {
      await dispose()
    }
  })

  it('reports a missing script instead of opening an empty params dialog', async () => {
    const { service, panel, dispose } = await setup()
    try {
      const rule = service.create(draft(CURRENT))
      await settle()
      const missing = { ...rule, script: { definitionId: 'MissingScript', inputs: {} } }

      panel.openParams(missing)
      expect(panel.paramsVisible.value).toBe(false)
      expect(panel.error.value).toContain('脚本不可用')
    } finally {
      await dispose()
    }
  })
})
