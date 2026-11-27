/**
 * 命令行配置：只接受显式 flag，缺项直接报错，不提供隐式默认。
 */

/** 运行配置；每一项都来自命令行。 */
export interface ServerConfig {
  readonly port: number
  readonly databasePath: string
  /** 脚本工作区目录。 */
  readonly scriptsDirectory: string
  /** 启用线程数；执行池与编译线程都由它决定。 */
  readonly workers: number
  /** 启用的数据源 id；由 CLI 显式给出。 */
  readonly sources: readonly string[]
}

const FLAG_PATTERN = /^--([a-z-]+)=(.*)$/

/** 解析 `--key=value` 形式的参数；未识别的 flag 视为错误。 */
function readFlags(argv: readonly string[]): ReadonlyMap<string, string> {
  const flags = new Map<string, string>()
  for (const argument of argv) {
    const match = FLAG_PATTERN.exec(argument)
    if (!match) throw new Error(`Unsupported argument: ${argument}`)
    flags.set(match[1]!, match[2]!)
  }
  return flags
}

/** 读取必填 flag；缺失时明确失败。 */
function requireFlag(flags: ReadonlyMap<string, string>, name: string): string {
  const value = flags.get(name)
  if (value === undefined || value === '') throw new Error(`Missing required flag: --${name}`)
  return value
}

/**
 * 解析服务配置。
 *
 * @param argv - 进程参数（不含 node 与脚本路径）
 * @returns 端口、数据库、脚本目录、线程数与数据源清单
 */
export function parseConfig(argv: readonly string[]): ServerConfig {
  const flags = readFlags(argv)
  const port = Number(requireFlag(flags, 'port'))
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error(`--port must be a valid port number: ${port}`)
  const workers = Number(requireFlag(flags, 'workers'))
  if (!Number.isInteger(workers) || workers < 1)
    throw new Error(`--workers must be a positive integer: ${workers}`)
  const sources = requireFlag(flags, 'sources')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id !== '')
  if (sources.length === 0) throw new Error('--sources must list at least one source id')
  return {
    port,
    databasePath: requireFlag(flags, 'db'),
    scriptsDirectory: requireFlag(flags, 'scripts'),
    workers,
    sources,
  }
}
