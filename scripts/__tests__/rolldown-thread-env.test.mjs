/** 验证 Rolldown 线程池环境变量的叠加规则：补默认值、不覆盖显式值、不丢基线变量、不改原对象。 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { ROLLDOWN_THREAD_LIMIT, withRolldownThreadLimit } from '../lib/rolldown-thread-env.mjs'

/** 三个需要被钉住的线程池变量名，与实现保持同一份清单。 */
const THREAD_ENV_NAMES = [
  'ROLLDOWN_WORKER_THREADS',
  'ROLLDOWN_MAX_BLOCKING_THREADS',
  'RAYON_NUM_THREADS',
]

test('未设置时补齐全部线程池变量', () => {
  const env = withRolldownThreadLimit({ PATH: '/usr/bin' })
  for (const name of THREAD_ENV_NAMES) {
    assert.equal(env[name], String(ROLLDOWN_THREAD_LIMIT))
  }
})

test('保留基线变量，否则子进程会丢失 PATH 等必需环境', () => {
  const env = withRolldownThreadLimit({ PATH: '/usr/bin', HOME: '/home/dev' })
  assert.equal(env.PATH, '/usr/bin')
  assert.equal(env.HOME, '/home/dev')
})

test('已显式设置的值不被覆盖', () => {
  const env = withRolldownThreadLimit({
    ROLLDOWN_WORKER_THREADS: '8',
    RAYON_NUM_THREADS: '0',
  })
  assert.equal(env.ROLLDOWN_WORKER_THREADS, '8')
  assert.equal(env.RAYON_NUM_THREADS, '0')
  // 未设置的项仍然补上
  assert.equal(env.ROLLDOWN_MAX_BLOCKING_THREADS, String(ROLLDOWN_THREAD_LIMIT))
})

test('不修改传入的环境变量对象', () => {
  const baseEnv = { PATH: '/usr/bin' }
  withRolldownThreadLimit(baseEnv)
  assert.deepEqual(baseEnv, { PATH: '/usr/bin' })
})
