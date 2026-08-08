/**
 * 内置行情数据源集中注册表
 * 数据源的展示元数据与出厂默认地址的单一事实来源，UI 面板与 Provider 装配共用
 */
import type { MarketSessionConfig } from '../../foundation/utils/sessionTimeLabels'

/** 本地默认行情服务地址，可通过数据源运行时配置覆盖 */
export const DEFAULT_V1_BASE_URL = 'http://127.0.0.1:8080'

/** 数据源注册声明：集中承载展示信息与出厂默认地址，运行时覆盖由注册表配置层负责 */
export interface DataSourceRegistration {
  id: string
  displayName: string
  description?: string
  defaultBaseUrl?: string
  marketSessions?: Readonly<Record<string, MarketSessionConfig>>
}

/** 内置数据源注册表 */
export const dataSourceRegistry = {
  gotdx: {
    id: 'gotdx',
    displayName: 'GOTDX',
    description: 'TDX data connector, source: https://github.com/363045841/GoTDX-Connecter',
    defaultBaseUrl: DEFAULT_V1_BASE_URL,
  },
  mock: {
    id: 'mock',
    displayName: 'Mock',
    description: 'Provides two test rendering instruments: MOCK-100 and MOCK-10000',
  },
  baostock: {
    id: 'baostock',
    displayName: 'BaoStock',
    description: 'BaoStock data connector, source: https://github.com/363045841/Baostock-Connecter',
    defaultBaseUrl: 'http://127.0.0.1:8000',
  },
  tradingview: {
    id: 'tradingview',
    displayName: 'TradingView',
    description:
      'Tradingview data connector, source: https://github.com/363045841/Baostock-Tradingview-Connecter',
    defaultBaseUrl: 'http://127.0.0.1:8000',
  },
} as const satisfies Record<string, DataSourceRegistration>
