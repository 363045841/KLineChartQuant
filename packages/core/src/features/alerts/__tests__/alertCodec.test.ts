/** 警报文档的版本边界。 */
import { expect, it } from 'vitest'
import { decodeAlertDocument } from '../impl/alertCodec.js'

it.each([0, 2])('rejects version %s', (version) => {
  expect(() => decodeAlertDocument({ version, alerts: [], fires: [] })).toThrow('Unsupported alert document version')
})
