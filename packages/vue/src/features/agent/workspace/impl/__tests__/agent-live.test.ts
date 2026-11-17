// 官方文档读取测试：运行失败只投影原因与详情，未知原因不进入界面。
import { LiveDoc } from '@earendil-works/pi-durable'
import { describe, expect, it } from 'vitest'
import type { JsonObject } from '../../../agent-contracts.js'
import { readRunFailure, type RunFailureView } from '../agent-live.js'

/** 构造只含 `pi.live` 文档的读取快照；不传失败时文档为空对象。 */
function live(runFailure?: JsonObject): Readonly<Record<string, JsonObject>> {
  return { [LiveDoc.definition.kind]: runFailure === undefined ? {} : { runFailure } }
}

describe('readRunFailure', () => {
  it.each<[string, Readonly<Record<string, JsonObject>>, RunFailureView | undefined]>([
    ['读取原因与详情', live({ reason: 'model_error', detail: 'upstream 502' }), {
      reason: 'model_error',
      detail: 'upstream 502',
    }],
    ['没有详情时只保留原因', live({ reason: 'aborted' }), { reason: 'aborted' }],
    ['还没有失败', live(), undefined],
    ['原因不在官方枚举内', live({ reason: 'quota_exhausted' }), undefined],
    ['文档缺失', {}, undefined],
  ])('%s', (_label, docs, expected) => {
    expect(readRunFailure(docs)).toEqual(expected)
  })
})
