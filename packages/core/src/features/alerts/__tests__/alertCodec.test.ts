/** 警报文档的加载与一次性导入边界。 */
import { expect, it } from 'vitest'
import { decodeAlertDocument, importAlertDocuments } from '../impl/alertCodec.js'
import { makeSymbolSpec } from '@/engine/data/__tests__/helpers/symbolSpecFixture.js'

it('imports separate version-one snapshots into one current document', () => {
  const rule = { id: 'rule', name: 'Rule', script: { definitionId: 'script', inputs: {} }, symbol: makeSymbolSpec({ symbol: 'TEST', period: 'daily', adjust: 'none' }), enabled: true, message: '{{message}}', channels: ['in-app'], createdAt: 1 }
  const fire = { id: 'fire', alertId: rule.id, firedAt: 2, source: { ticker: 'TEST', interval: 'daily' }, message: 'fired', price: 1, barTime: 1 }
  const imported = importAlertDocuments([{ version: 1, alerts: [rule] }], [{ version: 1, fires: [fire] }])
  expect(decodeAlertDocument(imported)).toEqual({ version: 2, alerts: [rule], fires: [fire] })
})

it.each([1, 3])('rejects version %s outside the import path', (version) => {
  expect(() => decodeAlertDocument({ version, alerts: [], fires: [] })).toThrow('Unsupported alert document version')
})
