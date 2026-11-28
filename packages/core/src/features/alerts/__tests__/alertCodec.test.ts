/** 警报文档的版本边界。 */
import { expect, it } from 'vitest'
import { decodeAlertDocument } from '../impl/alertCodec.js'

it('accepts the current document version', () => {
  expect(decodeAlertDocument({ version: 2, alerts: [], fires: [] })).toEqual({
    version: 2,
    alerts: [],
    fires: [],
  })
})

it.each([0, 1, 3])('rejects version %s', (version) => {
  expect(() => decodeAlertDocument({ version, alerts: [], fires: [] })).toThrow(
    'Unsupported alert document version',
  )
})
