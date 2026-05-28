import type { ParamConfig } from '@/components/IndicatorParams.vue'

export interface Indicator {
  id: string
  label: string
  name: string
  pane: 'main' | 'sub'
  description?: string
  params?: ParamConfig[]
}

const allIndicators: Indicator[] = [
  { id: 'MA', label: 'MA', name: '均线', pane: 'main' },
  {
    id: 'VOLUME',
    label: 'VOL',
    name: '成交量',
    pane: 'sub',
    description:
      '成交量反映市场活跃度，柱状图显示每根K线的交易量。上涨时柱子为红色，下跌时为绿色。',
  },
  {
    id: 'BOLL',
    label: 'BOLL',
    name: '布林带',
    pane: 'main',
    description:
      '布林带由三条轨道线组成，用于判断价格的波动范围和趋势强度。价格触及上轨可能超买，触及下轨可能超卖。',
    params: [
      {
        key: 'period',
        label: '周期',
        type: 'number',
        min: 2,
        max: 100,
        step: 1,
        default: 20,
        description: '计算移动平均线的周期数，周期越长轨道越平滑',
      },
      {
        key: 'multiplier',
        label: '倍数',
        type: 'number',
        min: 0.1,
        max: 5,
        step: 0.1,
        default: 2,
        description: '标准差倍数，决定轨道宽度，通常为 2',
      },
    ],
  },
  {
    id: 'EXPMA',
    label: 'EXPMA',
    name: '指数平滑移动平均线',
    pane: 'main',
    description:
      'EXPMA 对近期价格给予更高权重，比普通 MA 更敏感。快线上穿慢线为金叉看涨，下穿为死叉看跌。',
    params: [
      {
        key: 'fastPeriod',
        label: '快线',
        type: 'number',
        min: 2,
        max: 100,
        step: 1,
        default: 12,
        description: '快线周期，对价格变化更敏感',
      },
      {
        key: 'slowPeriod',
        label: '慢线',
        type: 'number',
        min: 2,
        max: 200,
        step: 1,
        default: 50,
        description: '慢线周期，用于判断趋势方向',
      },
    ],
  },
  {
    id: 'ENE',
    label: 'ENE',
    name: '轨道线',
    pane: 'main',
    description:
      'ENE 轨道线由三条轨道组成，价格突破上轨可能超买，突破下轨可能超卖，适合判断震荡行情的买卖点。',
    params: [
      {
        key: 'period',
        label: '周期',
        type: 'number',
        min: 2,
        max: 100,
        step: 1,
        default: 10,
        description: '计算中轨的周期数',
      },
      {
        key: 'deviation',
        label: '偏离率',
        type: 'number',
        min: 1,
        max: 30,
        step: 0.5,
        default: 11,
        description: '轨道偏离率百分比，决定轨道宽度',
      },
    ],
  },
  {
    id: 'MACD',
    label: 'MACD',
    name: '指数平滑异同移动平均线',
    pane: 'sub',
    description:
      'MACD 通过快慢均线的交叉判断趋势方向和动量。DIF 上穿 DEA 为金叉看涨，下穿为死叉看跌。',
    params: [
      {
        key: 'fastPeriod',
        label: '快线',
        type: 'number',
        min: 2,
        max: 50,
        step: 1,
        default: 12,
        description: '快线 EMA 周期，对价格变化更敏感',
      },
      {
        key: 'slowPeriod',
        label: '慢线',
        type: 'number',
        min: 2,
        max: 100,
        step: 1,
        default: 26,
        description: '慢线 EMA 周期，用于计算 DIF',
      },
      {
        key: 'signalPeriod',
        label: '信号',
        type: 'number',
        min: 2,
        max: 50,
        step: 1,
        default: 9,
        description: 'DEA 的 EMA 周期，用于生成买卖信号',
      },
    ],
  },
  {
    id: 'RSI',
    label: 'RSI',
    name: '相对强弱指标',
    pane: 'sub',
    description: 'RSI 衡量价格变动的速度和幅度，判断超买超卖状态。RSI > 70 超买，RSI < 30 超卖。',
    params: [
      {
        key: 'period1',
        label: '周期 1',
        type: 'number',
        min: 2,
        max: 100,
        step: 1,
        default: 6,
        description: '第一条 RSI 周期，通常为 6（快线）',
      },
      {
        key: 'period2',
        label: '周期 2',
        type: 'number',
        min: 2,
        max: 100,
        step: 1,
        default: 12,
        description: '第二条 RSI 周期，通常为 12（中线）',
      },
      {
        key: 'period3',
        label: '周期 3',
        type: 'number',
        min: 2,
        max: 100,
        step: 1,
        default: 24,
        description: '第三条 RSI 周期，通常为 24（慢线）',
      },
    ],
  },
  {
    id: 'CCI',
    label: 'CCI',
    name: '顺势指标',
    pane: 'sub',
    description:
      'CCI 衡量价格与统计平均值的偏离程度。CCI > 100 超买，CCI < -100 超卖，适合捕捉趋势反转。',
    params: [
      {
        key: 'period',
        label: '周期',
        type: 'number',
        min: 2,
        max: 100,
        step: 1,
        default: 14,
        description: '计算周期，周期越短信号越灵敏',
      },
    ],
  },
  {
    id: 'STOCH',
    label: 'STOCH',
    name: '随机指标',
    pane: 'sub',
    description:
      'KDJ 随机指标通过比较收盘价与价格区间判断超买超卖。K > 80 超买，K < 20 超卖，K 上穿 D 金叉。',
    params: [
      {
        key: 'n',
        label: 'K 周期',
        type: 'number',
        min: 2,
        max: 100,
        step: 1,
        default: 9,
        description: '计算 K 值的周期，统计 N 日内价格区间',
      },
      {
        key: 'm',
        label: 'D 周期',
        type: 'number',
        min: 1,
        max: 50,
        step: 1,
        default: 3,
        description: 'D 值是 K 的 M 日移动平均，使信号更平滑',
      },
    ],
  },
  {
    id: 'MOM',
    label: 'MOM',
    name: '动量指标',
    pane: 'sub',
    description:
      '动量指标衡量价格变化的速度，MOM > 0 表示上涨动能，MOM < 0 表示下跌动能。适合判断趋势强度。',
    params: [
      {
        key: 'period',
        label: '周期',
        type: 'number',
        min: 2,
        max: 100,
        step: 1,
        default: 10,
        description: '与多少日前价格比较，周期越短越灵敏',
      },
    ],
  },
  {
    id: 'WMSR',
    label: 'WMSR',
    name: '威廉指标',
    pane: 'sub',
    description: '威廉指标衡量超买超卖程度，范围为 -100 到 0。WMSR > -20 超买，WMSR < -80 超卖。',
    params: [
      {
        key: 'period',
        label: '周期',
        type: 'number',
        min: 2,
        max: 100,
        step: 1,
        default: 14,
        description: '回溯周期，统计周期内最高最低价',
      },
    ],
  },
  {
    id: 'KST',
    label: 'KST',
    name: '确然指标',
    pane: 'sub',
    description:
      'KST 综合多个 ROC 判断长期趋势，KST 上穿信号线看涨，下穿看跌。适合捕捉主要趋势转换。',
    params: [
      {
        key: 'roc1',
        label: 'ROC1',
        type: 'number',
        min: 2,
        max: 100,
        step: 1,
        default: 10,
        description: '短期变化率周期',
      },
      {
        key: 'roc2',
        label: 'ROC2',
        type: 'number',
        min: 2,
        max: 100,
        step: 1,
        default: 15,
        description: '中短期变化率周期',
      },
      {
        key: 'roc3',
        label: 'ROC3',
        type: 'number',
        min: 2,
        max: 100,
        step: 1,
        default: 20,
        description: '中长期变化率周期',
      },
      {
        key: 'roc4',
        label: 'ROC4',
        type: 'number',
        min: 2,
        max: 100,
        step: 1,
        default: 30,
        description: '长期变化率周期',
      },
      {
        key: 'signalPeriod',
        label: '信号',
        type: 'number',
        min: 2,
        max: 50,
        step: 1,
        default: 9,
        description: '信号线的 SMA 周期',
      },
    ],
  },
  {
    id: 'FASTK',
    label: 'FASTK',
    name: '快速随机指标',
    pane: 'sub',
    description:
      'FASTK 是未经过平滑处理的随机指标，比普通 KDJ 更敏感，能更快捕捉价格转折点，但假信号也更多。',
    params: [
      {
        key: 'period',
        label: '周期',
        type: 'number',
        min: 2,
        max: 100,
        step: 1,
        default: 9,
        description: '计算周期，周期越短越敏感',
      },
    ],
  },
  {
    id: 'ATR',
    label: 'ATR',
    name: '平均真实波幅',
    pane: 'sub',
    description:
      'ATR（Average True Range）衡量市场波动性，值越大表示波动越剧烈。Wilder 平滑算法，常用于设置止损位和判断趋势强度。',
    params: [
      {
        key: 'period',
        label: '周期',
        type: 'number',
        min: 1,
        max: 100,
        step: 1,
        default: 14,
        description: 'ATR 计算周期，周期越长曲线越平滑',
      },
    ],
  },
]

export const mainIndicators = allIndicators.filter((i) => i.pane === 'main')
export const subIndicators = allIndicators.filter((i) => i.pane === 'sub')

export function findIndicator(id: string): Indicator | undefined {
  return allIndicators.find((i) => i.id === id)
}

export function isSubIndicatorId(id: string): boolean {
  const indicator = allIndicators.find((i) => i.id === id)
  return indicator?.pane === 'sub'
}
