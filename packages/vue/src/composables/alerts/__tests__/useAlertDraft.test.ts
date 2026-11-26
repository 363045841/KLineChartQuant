/** 新建警报草稿：默认品种、同键复用与跨品种创建。 */
import { beforeAll, describe, expect, it } from 'vitest'
import { useAlertDraft } from '@vue-src/composables/alerts/useAlertDraft.js'
import {
  BTC,
  createAlertBackend,
  CURRENT,
  draft,
  ETH,
  registerScript,
  settle,
} from './helpers/alertTestKit.js'
import { effectScope } from 'vue'

beforeAll(registerScript)

async function setup() {
  const backend = await createAlertBackend()
  const scope = effectScope()
  const draftState = scope.run(() =>
    useAlertDraft({
      alerts: () => backend.service,
      currentSpec: () => CURRENT,
    }),
  )
  if (!draftState) throw new Error('Alert draft scope did not run')
  return {
    service: backend.service,
    draft: draftState,
    async dispose() {
      scope.stop()
      await backend.dispose()
    },
  }
}

describe('useAlertDraft', () => {
  it('defaults to the current instrument and creates the rule there', async () => {
    const { service, draft: state, dispose } = await setup()
    try {
      expect(state.instrument.value?.id).toBe(BTC.id)
      state.selectScript('PriceCross')
      expect(state.canAdd.value).toBe(true)
      expect(state.confirm()).toBe(true)
      await settle()

      const rules = service.list()
      expect(rules).toHaveLength(1)
      expect(rules[0]?.symbol.instrument.id).toBe(BTC.id)
      expect(rules[0]?.symbol.period).toBe('1min')
    } finally {
      await dispose()
    }
  })

  it('re-enables the same script and instrument instead of creating a duplicate', async () => {
    const { service, draft: state, dispose } = await setup()
    try {
      const existing = service.create({ ...draft(CURRENT), enabled: false })
      state.selectScript('PriceCross')
      expect(state.confirm()).toBe(true)
      await settle()

      expect(service.list()).toHaveLength(1)
      expect(service.get(existing.id)?.enabled).toBe(true)
    } finally {
      await dispose()
    }
  })

  it('creates on another instrument chosen from search', async () => {
    const { service, draft: state, dispose } = await setup()
    try {
      state.selectScript('PriceCross')
      state.selectInstrument(ETH)
      expect(state.confirm()).toBe(true)
      await settle()

      expect(service.list().map((rule) => rule.symbol.instrument.symbol)).toEqual(['ETHUSDT'])
    } finally {
      await dispose()
    }
  })

  it('reset clears the script, returns to the current instrument and blocks submit', async () => {
    const { service, draft: state, dispose } = await setup()
    try {
      state.selectScript('PriceCross')
      state.selectInstrument(ETH)
      state.reset()

      expect(state.definitionId.value).toBeNull()
      expect(state.instrument.value?.id).toBe(BTC.id)
      expect(state.canAdd.value).toBe(false)
      expect(state.confirm()).toBe(false)
      expect(service.list()).toHaveLength(0)
    } finally {
      await dispose()
    }
  })
})
