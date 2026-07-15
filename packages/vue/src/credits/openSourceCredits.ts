import aiRuntimePkg from '../../../ai-runtime/package.json'
import mcpPkg from '../../../ai-runtime/node_modules/@modelcontextprotocol/sdk/package.json'
import wsPkg from '../../../ai-runtime/node_modules/ws/package.json'
import corePkg from '../../../core/package.json'
import ajvPkg from '../../../core/node_modules/ajv/package.json'
import effectPkg from '../../../core/node_modules/effect/package.json'
import vuePkg from '../../package.json'
import vueLibPkg from 'vue/package.json'

export interface CreditItem {
  name: string
  version: string
  license: string
  /** GitHub 仓库页，可点击跳转 */
  url: string
}

export interface CreditSection {
  id: 'workspace' | 'third-party'
  title: string
  items: CreditItem[]
}

/** 展示白名单：只维护包名与分区，版本/许可证/仓库从 package.json 读取 */
export const OPEN_SOURCE_WHITELIST = [
  { name: '@363045841yyt/klinechart', section: 'workspace' },
  { name: '@363045841yyt/klinechart-core', section: 'workspace' },
  { name: '@363045841yyt/klinechart-ai-runtime', section: 'workspace' },
  { name: 'effect', section: 'third-party' },
  { name: 'ajv', section: 'third-party' },
  { name: '@modelcontextprotocol/sdk', section: 'third-party' },
  { name: 'ws', section: 'third-party' },
  { name: 'vue', section: 'third-party' },
] as const

type WhitelistName = (typeof OPEN_SOURCE_WHITELIST)[number]['name']

interface PackageMeta {
  version: string
  license?: string | { type?: string }
  repository?: string | { type?: string; url?: string }
  homepage?: string
}

/** 本 monorepo 默认仓库（ai-runtime 等未写 repository 时回退） */
const MONOREPO_GITHUB = 'https://github.com/363045841/KLineChartQuant'

/** 白名单包 → package.json（构建时内联元数据） */
const PACKAGE_META: Record<WhitelistName, PackageMeta> = {
  '@363045841yyt/klinechart': vuePkg,
  '@363045841yyt/klinechart-core': corePkg,
  '@363045841yyt/klinechart-ai-runtime': aiRuntimePkg,
  effect: effectPkg,
  ajv: ajvPkg,
  '@modelcontextprotocol/sdk': mcpPkg,
  ws: wsPkg,
  vue: vueLibPkg,
}

const SECTION_TITLES: Record<'workspace' | 'third-party', string> = {
  workspace: '本仓库包',
  'third-party': '其他开源项目',
}

function readLicense(meta: PackageMeta): string {
  if (typeof meta.license === 'string' && meta.license.length > 0) return meta.license
  if (meta.license && typeof meta.license === 'object' && meta.license.type) {
    return meta.license.type
  }
  return 'UNKNOWN'
}

/**
 * 将 package.json 的 repository / homepage 规范为 https GitHub 仓库页。
 * 支持：完整 git URL、git+https、owner/repo 短写、ssh。
 */
export function resolveGithubUrl(meta: PackageMeta, fallback = MONOREPO_GITHUB): string {
  const raw =
    typeof meta.repository === 'string'
      ? meta.repository
      : meta.repository?.url || meta.homepage || ''

  if (!raw) return fallback

  let s = raw.trim()
  s = s.replace(/^git\+/, '')
  s = s.replace(/^git:\/\//, 'https://')
  s = s.replace(/^ssh:\/\/git@/, 'https://')
  s = s.replace(/^git@github\.com:/, 'https://github.com/')
  s = s.replace(/\.git$/i, '')

  // owner/repo 短写
  if (/^[\w.-]+\/[\w.-]+$/.test(s)) {
    return `https://github.com/${s}`
  }

  // 已是 github http(s)
  const m = s.match(/https?:\/\/(?:www\.)?github\.com\/[\w.-]+\/[\w.-]+/i)
  if (m) return m[0]

  // homepage 若是 github
  if (meta.homepage) {
    const hm = meta.homepage.match(/https?:\/\/(?:www\.)?github\.com\/[\w.-]+\/[\w.-]+/i)
    if (hm) return hm[0]
  }

  return fallback
}

function toCreditItem(name: WhitelistName): CreditItem {
  const meta = PACKAGE_META[name]
  return {
    name,
    version: meta.version,
    license: readLicense(meta),
    url: resolveGithubUrl(meta),
  }
}

/**
 * 设置弹窗「开源致谢」。
 * 展示范围由 OPEN_SOURCE_WHITELIST 决定；版本、许可证、仓库从 package.json 读取。
 */
export function getOpenSourceCredits(): CreditSection[] {
  const grouped: Record<'workspace' | 'third-party', CreditItem[]> = {
    workspace: [],
    'third-party': [],
  }

  for (const entry of OPEN_SOURCE_WHITELIST) {
    grouped[entry.section].push(toCreditItem(entry.name))
  }

  return (['workspace', 'third-party'] as const).map((id) => ({
    id,
    title: SECTION_TITLES[id],
    items: grouped[id],
  }))
}
