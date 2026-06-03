export interface ParamConfig {
  key: string
  label: string
  type: 'number'
  min?: number
  max?: number
  step?: number
  default?: number
  description?: string
}

export interface Indicator {
  id: string
  label: string
  name: string
  pane: 'main' | 'sub'
  description?: string
  params?: ParamConfig[]
}

export const allIndicators: Indicator[] = [
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
    // === PR 合入的新指标 ===
    {
        id: 'WMA',
        label: 'WMA',
        name: '加权移动平均',
        pane: 'main',
        description: 'WMA 对近期价格赋予更高权重，比普通 MA 反应更快，适用于短期趋势跟踪。',
        params: [{ key: 'period', label: '周期', type: 'number', min: 2, max: 100, step: 1, default: 10, description: '计算周期' }],
    },
    {
        id: 'DEMA',
        label: 'DEMA',
        name: '双指数移动平均',
        pane: 'main',
        description: 'DEMA 通过双重平滑减少滞后，比传统 EMA 更贴近价格，适合快速趋势判断。',
        params: [{ key: 'period', label: '周期', type: 'number', min: 2, max: 100, step: 1, default: 14, description: '计算周期' }],
    },
    {
        id: 'TEMA',
        label: 'TEMA',
        name: '三指数移动平均',
        pane: 'main',
        description: 'TEMA 三重平滑，滞后最小，响应最快，适合敏锐捕捉价格变化。',
        params: [{ key: 'period', label: '周期', type: 'number', min: 2, max: 100, step: 1, default: 14, description: '计算周期' }],
    },
    {
        id: 'HMA',
        label: 'HMA',
        name: '赫尔移动平均',
        pane: 'main',
        description: 'HMA 通过加权移动平均和平方根计算，在平滑度和响应速度之间取得极佳平衡。',
        params: [{ key: 'period', label: '周期', type: 'number', min: 2, max: 100, step: 1, default: 14, description: '计算周期' }],
    },
    {
        id: 'KAMA',
        label: 'KAMA',
        name: '考夫曼自适应移动平均',
        pane: 'main',
        description: 'KAMA 根据市场噪音自适应调整平滑度，趋势强时快速跟随，震荡时平滑过滤。',
        params: [
            { key: 'period', label: '周期', type: 'number', min: 2, max: 100, step: 1, default: 10, description: 'ER 计算周期' },
            { key: 'fastPeriod', label: '快线', type: 'number', min: 2, max: 30, step: 1, default: 2, description: '最快平滑系数' },
            { key: 'slowPeriod', label: '慢线', type: 'number', min: 2, max: 60, step: 1, default: 30, description: '最慢平滑系数' },
        ],
    },
    {
        id: 'SAR',
        label: 'SAR',
        name: '抛物线转向',
        pane: 'main',
        description: 'SAR（Parabolic Stop and Reverse）通过抛物线轨迹跟踪趋势，提供动态止损和反转信号。',
        params: [
            { key: 'step', label: '步长', type: 'number', min: 0.001, max: 0.1, step: 0.001, default: 0.02, description: '加速度步长' },
            { key: 'maxStep', label: '最大步长', type: 'number', min: 0.01, max: 0.5, step: 0.01, default: 0.2, description: '最大加速度上限' },
        ],
    },
    {
        id: 'SUPERTREND',
        label: 'ST',
        name: '超级趋势',
        pane: 'main',
        description: 'SuperTrend 基于 ATR 的通道突破系统，价格在通道上方为多头趋势，下方为空头趋势。',
        params: [
            { key: 'atrPeriod', label: 'ATR 周期', type: 'number', min: 2, max: 100, step: 1, default: 10, description: 'ATR 计算周期' },
            { key: 'multiplier', label: '倍数', type: 'number', min: 0.5, max: 10, step: 0.5, default: 3, description: 'ATR 倍数' },
        ],
    },
    {
        id: 'KELTNER',
        label: 'KC',
        name: '肯特纳通道',
        pane: 'main',
        description: 'Keltner Channel 以 EMA 为中轨，ATR 倍数确定通道宽度，适合判断突破与回归。',
        params: [
            { key: 'emaPeriod', label: 'EMA 周期', type: 'number', min: 2, max: 100, step: 1, default: 20, description: '中轨 EMA 周期' },
            { key: 'atrPeriod', label: 'ATR 周期', type: 'number', min: 2, max: 100, step: 1, default: 10, description: 'ATR 计算周期' },
            { key: 'multiplier', label: '倍数', type: 'number', min: 0.5, max: 10, step: 0.5, default: 2, description: 'ATR 倍数' },
        ],
    },
    {
        id: 'DONCHIAN',
        label: 'DC',
        name: '唐奇安通道',
        pane: 'main',
        description: 'Donchian Channel 显示 N 日内最高价和最低价的通道，价格突破上下轨视为趋势信号。',
        params: [{ key: 'period', label: '周期', type: 'number', min: 2, max: 200, step: 1, default: 20, description: '通道周期' }],
    },
    {
        id: 'ICHIMOKU',
        label: 'IK',
        name: '一目均衡表',
        pane: 'main',
        description: 'Ichimoku Kinko Hyo（一目均衡表）综合显示支撑阻力、趋势方向和动量，云区变色提示趋势转换。',
        params: [
            { key: 'tenkanPeriod', label: '转折线', type: 'number', min: 2, max: 100, step: 1, default: 9, description: 'Tenkan-sen 周期' },
            { key: 'kijunPeriod', label: '基准线', type: 'number', min: 2, max: 100, step: 1, default: 26, description: 'Kijun-sen 周期' },
            { key: 'spanBPeriod', label: '领先线 B', type: 'number', min: 2, max: 200, step: 1, default: 52, description: 'Senkou Span B 周期' },
            { key: 'displacement', label: '偏移', type: 'number', min: 1, max: 52, step: 1, default: 26, description: '偏移量' },
        ],
    },
    {
        id: 'ROC',
        label: 'ROC',
        name: '变化率',
        pane: 'sub',
        description: 'ROC 衡量当前价格与 N 日前价格的百分比变化，正值表示上涨动能，负值表示下跌动能。',
        params: [{ key: 'period', label: '周期', type: 'number', min: 2, max: 100, step: 1, default: 12, description: 'ROC 周期' }],
    },
    {
        id: 'TRIX',
        label: 'TRIX',
        name: '三重指数平滑平均',
        pane: 'sub',
        description: 'TRIX 三平滑后取 ROC，过滤短期波动，上穿信号线为买入信号，下穿为卖出信号。',
        params: [
            { key: 'period', label: '周期', type: 'number', min: 2, max: 100, step: 1, default: 15, description: 'TRIX 周期' },
            { key: 'signalPeriod', label: '信号', type: 'number', min: 2, max: 50, step: 1, default: 9, description: '信号线周期' },
        ],
    },
    {
        id: 'HV',
        label: 'HV',
        name: '历史波动率',
        pane: 'sub',
        description: 'HV 衡量过去 N 日对数收益率的年化标准差，值越高表示市场波动越大。',
        params: [
            { key: 'period', label: '周期', type: 'number', min: 2, max: 100, step: 1, default: 20, description: '计算周期' },
            { key: 'annualizationFactor', label: '年化因子', type: 'number', min: 1, max: 365, step: 1, default: 252, description: '年化天数' },
        ],
    },
    {
        id: 'PARKINSON',
        label: 'PK',
        name: '帕金森波动率',
        pane: 'sub',
        description: 'Parkinson 利用最高最低价估算波动率，比 HV 更高效，捕捉日内波动范围。',
        params: [
            { key: 'period', label: '周期', type: 'number', min: 2, max: 100, step: 1, default: 20, description: '计算周期' },
            { key: 'annualizationFactor', label: '年化因子', type: 'number', min: 1, max: 365, step: 1, default: 252, description: '年化天数' },
        ],
    },
    {
        id: 'CHAIKIN_VOL',
        label: 'CV',
        name: '蔡金波动率',
        pane: 'sub',
        description: 'Chaikin Volatility 衡量价格区间的宽度变化，波动率扩张预示突破，收缩预示盘整。',
        params: [
            { key: 'emaPeriod', label: 'EMA 周期', type: 'number', min: 2, max: 100, step: 1, default: 10, description: '平滑周期' },
            { key: 'rocPeriod', label: 'ROC 周期', type: 'number', min: 2, max: 100, step: 1, default: 10, description: '变化率周期' },
        ],
    },
    {
        id: 'VMA',
        label: 'VMA',
        name: '成交量移动平均',
        pane: 'sub',
        description: 'VMA 对成交量做移动平均，量能上升确认趋势，量能萎缩预示反转。',
        params: [{ key: 'period', label: '周期', type: 'number', min: 2, max: 100, step: 1, default: 5, description: 'VMA 周期' }],
    },
    {
        id: 'OBV',
        label: 'OBV',
        name: '能量潮',
        pane: 'sub',
        description: 'OBV 累积量能，价格上涨时加量，下跌时减量。OBV 趋势与价格背离常预示反转。',
        params: [],
    },
    {
        id: 'PVT',
        label: 'PVT',
        name: '价量趋势',
        pane: 'sub',
        description: 'PVT 将成交量按价格变化率加权累计，比 OBV 更精细，反映资金流入流出力度。',
        params: [],
    },
    {
        id: 'VWAP',
        label: 'VWAP',
        name: '成交量加权均价',
        pane: 'sub',
        description: 'VWAP（Volume-Weighted Average Price）以成交量加权的均价线，机构常用作日内交易基准。',
        params: [{ key: 'sessionResetGapMs', label: '重置间隔', type: 'number', min: 0, max: 86400000, step: 3600000, default: 0, description: '0=不重置，>0=超过间隔毫秒重置' }],
    },
    {
        id: 'CMF',
        label: 'CMF',
        name: '蔡金资金流',
        pane: 'sub',
        description: 'CMF（Chaikin Money Flow）衡量资金流入流出强度，正值看涨，负值看跌。',
        params: [{ key: 'period', label: '周期', type: 'number', min: 2, max: 100, step: 1, default: 20, description: 'CMF 周期' }],
    },
    {
        id: 'MFI',
        label: 'MFI',
        name: '资金流量指数',
        pane: 'sub',
        description: 'MFI（Money Flow Index）类似 RSI 但用量能加权，判断超买超卖。MFI > 80 超买，MFI < 20 超卖。',
        params: [{ key: 'period', label: '周期', type: 'number', min: 2, max: 100, step: 1, default: 14, description: 'MFI 周期' }],
    },
    {
        id: 'PIVOT',
        label: 'PP',
        name: '枢轴点',
        pane: 'main',
        description: 'Pivot Points 根据前日最高/最低/收盘计算支撑阻力位，R1-R3 为阻力，S1-S3 为支撑。',
        params: [],
    },
    {
        id: 'FIB',
        label: 'FIB',
        name: '斐波那契',
        pane: 'main',
        description: 'Fibonacci 回调线标记关键回撤位（0.236/0.382/0.5/0.618/0.786），用于判断回调目标。',
        params: [{ key: 'period', label: '周期', type: 'number', min: 5, max: 500, step: 1, default: 50, description: '计算周期' }],
    },
    {
        id: 'STRUCTURE',
        label: 'SMC',
        name: 'SMC 结构',
        pane: 'main',
        description: 'Swing / BOS / CHOCH 识别市场结构转换，突破结构（BOS）确认趋势，趋势反转（CHOCH）提示反转。',
        params: [
            { key: 'leftWindow', label: '左窗口', type: 'number', min: 1, max: 20, step: 1, default: 2, description: '摆点左侧 K 线数' },
            { key: 'rightWindow', label: '右窗口', type: 'number', min: 1, max: 20, step: 1, default: 2, description: '摆点右侧 K 线数' },
        ],
    },
    {
        id: 'ZONES',
        label: 'ZONES',
        name: 'SMC 区域',
        pane: 'main',
        description: 'FVG（公允价值缺口）和 Order Block（订单块）识别机构交易行为中的关键流动性区域。',
        params: [
            { key: 'obLookback', label: 'OB 回溯', type: 'number', min: 1, max: 50, step: 1, default: 5, description: 'Order Block 回溯窗口' },
        ],
    },
    {
        id: 'VOLUME_PROFILE',
        label: 'VP',
        name: '成交量分布',
        pane: 'sub',
        description: 'Volume Profile 显示各价位成交量分布，识别高量区域（价值区）和低量区域（缺口），POC 为成交量最大价位。',
        params: [
            { key: 'bins', label: '分箱数', type: 'number', min: 5, max: 100, step: 1, default: 24, description: '价格分箱数' },
            { key: 'lookback', label: '回溯', type: 'number', min: 0, max: 500, step: 1, default: 0, description: '0=全部数据' },
            { key: 'valueAreaPercent', label: '价值区%', type: 'number', min: 0.1, max: 1, step: 0.05, default: 0.7, description: '价值区占比' },
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
