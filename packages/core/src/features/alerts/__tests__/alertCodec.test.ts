/** 警报文档编解码：只接受当前版本，旧版本从不迁移。 */
import { expect, it } from 'vitest'
import { decodeRules } from '../impl/alertCodec.js'

it('rejects an unknown rules version instead of migrating it', () => {
  expect(() => decodeRules({ version: 2, alerts: [] })).toThrow(
    'Unsupported alert rules version',
  )
})
