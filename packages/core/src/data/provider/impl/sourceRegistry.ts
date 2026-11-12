/**
 * 内置行情数据源集中注册表
 * 数据源的展示元数据与出厂默认地址的单一事实来源，UI 面板与 Provider 装配共用
 */

import { DataSource } from '@363045841yyt/klinechart-plot-contracts'
import type { MarketSessionConfig } from '@/foundation/utils/sessionTimeLabels.js'

/** 本地默认行情服务地址，可通过数据源运行时配置覆盖 */
export const DEFAULT_V1_BASE_URL = 'http://127.0.0.1:8080'

/** 数据源注册声明：集中承载展示信息、出厂默认地址与私有会话覆盖；共享会话只在 builtinMarketSessions.json 定义。 */
export interface DataSourceRegistration {
  id: string
  connectionId?: string
  displayName: string
  description?: string
  defaultBaseUrl?: string
  /** 仅声明内置表没有的私有会话；共享时段不得在此重复定义。 */
  marketSessions?: Readonly<Record<string, MarketSessionConfig>>
}

/** 内置数据源注册表 */
export const dataSourceRegistry = {
  binance: {
    id: DataSource.Binance,
    displayName: 'Binance Spot / Perp',
    description: 'Binance 现货与 USDT-M 永续 K 线、真实逐笔成交',
    defaultBaseUrl: 'http://127.0.0.1:8091',
  },
  gotdx: {
    id: DataSource.Gotdx,
    displayName: 'GOTDX',
    description: 'TDX data connector, source: https://github.com/363045841/GoTDX-Connector',
    defaultBaseUrl: DEFAULT_V1_BASE_URL,
  },
  mock: {
    id: DataSource.Mock,
    displayName: 'Mock',
    description: 'Provides one on-demand infinite daily series (MOCK) for local rendering',
  },
  baostock: {
    id: DataSource.BaoStock,
    connectionId: 'baostock-tradingview',
    displayName: 'BaoStock',
    description:
      'BaoStock data connector, source: https://github.com/363045841/Baostock-Tradingview-Connector',
    defaultBaseUrl: 'http://127.0.0.1:8000',
  },
  tradingview: {
    id: DataSource.TradingView,
    connectionId: 'baostock-tradingview',
    displayName: 'TradingView',
    description:
      'Tradingview data connector, source: https://github.com/363045841/Baostock-Tradingview-Connector',
    defaultBaseUrl: 'http://127.0.0.1:8000',
  },
  mt5: {
    id: DataSource.MT5,
    displayName: 'MT5 (Exness)',
    description:
      'MT5 local terminal connector (Exness), source: https://github.com/EliteOtaku/KCQ-MT5-connector',
    defaultBaseUrl: 'http://127.0.0.1:8090',
    // MT5 品种（外汇/加密/金属 CFD）近似 7x24，会话定义见内置表 MT5（UTC）
  },
  ths: {
    id: DataSource.THS,
    displayName: '同花顺 THS',
    description:
      '同花顺(fuyao) A股/指数/ETF/期货/期权日线连接器, source: https://github.com/EliteOtaku/KCQ-THS-connector',
    defaultBaseUrl: 'http://127.0.0.1:8092',
    // 上游端外仅提供日线级行情。A股/指数/ETF 的品种声明 sessionId='CN'（复用内置
    // Asia/Shanghai 会话）；期货/期权的交易时段（含夜盘）与股票不同，其品种不带
    // sessionId，故此处无需声明额外 marketSessions。
  },
} as const satisfies Record<string, DataSourceRegistration>
