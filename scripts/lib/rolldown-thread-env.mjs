/**
 * rolldown-thread-env.mjs
 *
 * 为开发期的 Vite 进程限制 Rolldown 线程池规模，抑制依赖预打包后的内存驻留。
 *
 * 背景：Vite 8 的依赖优化器改用进程内的 Rolldown（Rust napi 绑定），它在按 CPU 核数创建的
 * worker 池上分配内存；而所用的分配器 mimalloc v2 的页是线程私有的——线程不退出就不归还
 * 操作系统，于是进程占用接近「各线程历史峰值之和」，核数越多越夸张。mimalloc v3 的修复
 * （rolldown#9349，实测降约一半）在 Windows 上不生效，因为 build_mimalloc_win() 硬编码走 v2。
 * 参见 rolldown#9330 与 rolldown#10984；本仓库的数据与复现步骤见 rolldown#11233。
 *
 * 本机实测（16 核，冷缓存跑一次依赖优化，两次独立对照）：把 worker 池钉在 4 之后，
 * 提交内存 1943/2509 MB → 1135/1184 MB，且从「每次都不同」变为稳定，启动耗时无回退。
 *
 * 必须在进程启动时经环境变量传入：Rolldown 绑定在 Vite 读取配置前后就可能初始化，
 * 在 vite.config 里改 process.env 为时已晚。
 */

/** 钉死的 worker 线程上限。依赖预打包只在缓存失效时跑一次，压到 4 的收益远大于并行度损失。 */
export const ROLLDOWN_THREAD_LIMIT = 4

/** 需要钉住的线程池环境变量：Rolldown 自身的 worker 池、阻塞池，以及 rayon 系 crate。 */
const THREAD_LIMIT_ENV_NAMES = [
  'ROLLDOWN_WORKER_THREADS',
  'ROLLDOWN_MAX_BLOCKING_THREADS',
  'RAYON_NUM_THREADS',
]

/**
 * 在给定环境变量上叠加 Rolldown 线程池上限。
 * 已显式设置的项不覆盖，避免与开发者自己的调参冲突。
 * @param {Record<string, string | undefined>} baseEnv 基线环境变量
 * @returns {Record<string, string | undefined>} 基线环境变量的副本，叠加了未设置的线程池变量
 */
export function withRolldownThreadLimit(baseEnv = process.env) {
  const env = { ...baseEnv }
  for (const name of THREAD_LIMIT_ENV_NAMES) {
    if (env[name] === undefined) env[name] = String(ROLLDOWN_THREAD_LIMIT)
  }
  return env
}
