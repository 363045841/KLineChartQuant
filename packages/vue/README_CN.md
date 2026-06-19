高性能金融图表库，单帧生成时间仅需2ms，在200Hz环境下稳定实现190fps流畅滚动，原生支持AI Agent控制，全链路ResizeObserver驱动清晰渲染，采用可插拔架构。

<div align="center">

[English](README.md) | 简体中文

#  KLineChartQuant

**清晰渲染 · 高性能 · 优化交互 · 移动端友好**

[![npm version](https://img.shields.io/npm/v/@363045841yyt/klinechart.svg?style=flat&color=blue)](https://www.npmjs.com/package/@363045841yyt/klinechart) [![npm downloads](https://img.shields.io/npm/dm/@363045841yyt/klinechart.svg?style=flat&color=green)](https://www.npmjs.com/package/@363045841yyt/klinechart) [![license](https://img.shields.io/npm/l/@363045841yyt/klinechart.svg?style=flat&color=orange)](https://github.com/363045841/klinechart/blob/main/LICENSE) [![demo](https://img.shields.io/badge/演示-在线-purple?style=flat)](https://363045841.github.io/KLineChartQuant/)

[![qq](https://img.shields.io/badge/QQ-672011965-blue?style=flat)](https://qm.qq.com/q/672011965) [![tg](https://img.shields.io/badge/Telegram-加入-26A5E4?style=flat&logo=telegram)](https://t.me/+1o-6B-wVRTU2MjQ9)

</div>

---

一个专注于量化交易场景的轻量级金融K线图库。**Agent是一等公民** —— 支持AI Agent直接控制图表操作，提供媲美TradingView的交互体验。

<div align="center">
  <img src="https://files.seeusercontent.com/2026/06/05/5Nfe/dark1.png" width="400" style="border-radius: 12px; margin: 8px;" />
  <img src="https://files.seeusercontent.com/2026/06/05/vN2k/dark2.png" width="400" style="border-radius: 12px; margin: 8px;" />
  <br/>
  <img src="https://files.seeusercontent.com/2026/06/05/Udw3/white1.png" width="400" style="border-radius: 12px; margin: 8px;" />
  <img src="https://files.seeusercontent.com/2026/06/05/vQg8/white2.png" width="400" style="border-radius: 12px; margin: 8px;" />
  <br/>
  <div style="display: flex; align-items: flex-start; justify-content: center; gap: 8px;">
    <div style="display: flex; flex-direction: column; gap: 8px;">
      <img src="https://files.seeusercontent.com/2026/06/18/Uab4/pasted-image-1781798801155.webp" width="400" style="border-radius: 12px;" />
      <img src="https://files.seeusercontent.com/2026/06/18/Hcq8/QQ20260619000024.jpg" width="400" style="border-radius: 12px;" />
    </div>
  </div>
</div>

## ✨ 核心特性

- **Agent优先** —— 支持AI Agent直接控制图表，缩放、平移、绘制等操作均可通过编程方式调用
- **清晰渲染** —— 全链路ResizeObserver驱动，物理像素对齐，确保K线、影线和线条在所有DPR屏幕上都能锐利清晰呈现
- **插件架构** —— 基于插件化的渲染器设计，支持动态注册、配置和生命周期管理
- **自定义标记** —— 支持语义化配置的自定义标记和自定义信息
- **高性能** —— 流畅处理数万条数据，缩放或平移时无卡顿；在**200Hz显示器上支持190-200fps**，单帧生成时间低至**2ms**
- **WebGL渲染** —— K线、成交量柱和MACD柱通过WebGL渲染，利用GPU加速，在**200Hz显示器上达到190fps**，每帧GPU耗时低于**1ms**
- **优化交互** —— 稳定的缩放锚点、精准的十字光标、流畅的拖拽体验
- **移动端交互优化** —— 长按十字线浏览数据不触发滚动，拖拽移动十字线，轻点取消，再次触摸手势滚动

## 🚀 快速开始

### 前置条件

KLineChart需要股票数据后端支持。请确保 `kmap` 和 `stockbao` 位于同一目录下：

```
workspace/
├── KLineChartQuant/ # 本仓库
└── stockbao/    # 数据后端仓库
```

### 1. 克隆仓库

```bash
git clone https://github.com/363045841/KLineChartQuant.git
git clone https://github.com/363045841/stockbao.git
```

### 2. 启动数据后端

```bash
cd KLineChartQuant
npm run stockbao
```

启动后，API可通过 `http://localhost:8000` 访问

### 3. 安装和使用

```bash
npm install @363045841yyt/klinechart
```

```vue
<script setup lang="ts">
import KLineChart from '@363045841yyt/klinechart';
import type { SemanticChartConfig } from '@363045841yyt/klinechart';

const config: SemanticChartConfig = {
  version: '1.0.0',
  data: {
    source: 'baostock',
    code: 'sh.000001',
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    frequency: 'day'
  },
  indicators: {
    main: [{ type: 'MA', params: [5, 10, 20] }],
    sub: [{ type: 'MACD' }]
  }
};
</script>

<template>
  <KLineChart
    :semanticConfig="config"
    :yPaddingPx="24"
  />
</template>
```

### 直接注入自定义数据（无需后端）

```vue
<script setup lang="ts">
import KLineChart from '@363045841yyt/klinechart'
import type { CustomDataSource, KLineData } from '@363045841yyt/klinechart'

const myData: KLineData[] = [
  { timestamp: 1748736000000, date: '2025-06-01', open: 30, high: 32, low: 30, close: 31.5, volume: 1500000 },
  { timestamp: 1748822400000, date: '2025-06-02', open: 31.5, high: 33.2, low: 31.2, close: 33, volume: 2100000 },
]

const customDataSource: CustomDataSource = {
  symbol: 'MY.STOCK',
  period: 'daily',
  data: myData,
  comparisons: {
    'COMP.A': [ /* 对比商品 KLineData[] */ ],
    'COMP.B': [ /* 对比商品 KLineData[] */ ],
  },
}
</script>

<template>
  <KLineChart :customData="customDataSource" />
</template>
```

## 📖 更多文档

- [渲染引擎架构](./docs/rendering-engine-architecture.md) —— 核心渲染管线与物理像素对齐机制
- [插件系统](./docs/PLUGIN_SYSTEM.md) —— 扩展机制与自定义开发
- [渲染器开发指南](./docs/renderer-development-guide.md) —— 自定义渲染器开发

## 📋 组件属性

| 属性 | 类型 | 默认值 | 描述 |
|------|------|---------|-------------|
| semanticConfig | `SemanticChartConfig` | **必填** | 语义化配置，是图表数据和指标的唯一控制源 |
| yPaddingPx | `number` | 0 | Y轴内边距（像素） |
| minKWidth | `number` | 2 | 最小K线宽度（逻辑像素） |
| maxKWidth | `number` | 50 | 最大K线宽度（逻辑像素） |
| rightAxisWidth | `number` | 0 | 右侧价格坐标轴宽度 |
| bottomAxisHeight | `number` | 24 | 底部时间坐标轴高度 |
| priceLabelWidth | `number` | 60 | 价格标签的额外宽度，用于显示涨跌幅 |
| zoomLevels | `number` | 20 | 缩放等级总数 |
| initialZoomLevel | `number` | 3 | 初始缩放等级（1 ~ zoomLevels） |
| customData | `CustomDataSource` | — | 内联数据包：`{ symbol?, period?, data, comparisons? }`。完全绕过数据请求器，直接使用传入的数据渲染 |

## 🗺️ 路线图

- [x] K线缩放锚点稳定性，提升缩放手感
- [x] 右侧坐标轴与滚动容器分离，彻底解决裁剪问题
- [x] 空白区域绘制支持
- [x] 限制垂直平移范围，防止视口脱离数据区域
- [x] 绘图系统
- [x] 右侧坐标轴缩放
- [x] 最新价线及右侧坐标轴标签样式优化
- [x] 区域图元工具与渲染
- [x] **Monorepo + 多框架支持** —— 拆分为 `@363045841yyt/klinechart-core`、`@363045841yyt/klinechart`、`@363045841yyt/klinechart-react`、`@363045841yyt/klinechart-angular`
- [ ] React绑定包 (`@363045841yyt/klinechart-react`)
- [ ] Angular绑定包 (`@363045841yyt/klinechart-angular`)
- [ ] 更高级的绘图工具
- [ ] 支持分钟、多日、月、年K线显示
- [ ] 支持将绘图转换为量化代码

## 🚀 更新日志

- **v0.7.0** **Monorepo重构 + 多框架支持** —— 核心引擎抽取为 `@363045841yyt/klinechart-core`；Vue绑定迁移至 `@363045841yyt/klinechart`；React和Angular包已搭建脚手架。框架无关设计，支持可注入的数据获取器 (`__setDataFetcher`) 和语义化配置支持
- **v0.6.10** 统一所有窗格的WebGL渲染上下文共享，并重构子窗格生命周期 —— 通过SubPaneManager实现集中的窗格实例管理，以paneId为首要身份标识
- **v0.6.6** 全面渲染优化：批量价格到Y轴计算、缓存刻度位置和几何数据、优化月份键操作；在**200Hz显示器上稳定达到190-200fps**，帧生成时间降至**2ms**
- **v0.6.3** K线、成交量柱和MACD柱采用WebGL渲染；全面显著提升性能
- **v0.6.1** 双层画布架构：主画布与叠加层分离，结合UpdateLevel过滤，在**200Hz显示器上稳定实现180fps低抖动**
- **v0.6.0** 无状态指标管线：MA/BOLL/EXPMA/ENE/RSI/CCI/STOCH/MOM/WMSR/KST/FASTK现已采用统一的 Calculator → Scheduler → StateStore → Renderer 架构，以获得更好的性能和可维护性
- **v0.5.6** 对数价格坐标轴，像素级别均匀分布网格线
- **v0.5.2** 高级绘图工具：平行通道、回归通道、平滑顶底和非相交通道
- **v0.5.0** 完整的绘图工具系统，支持线段、矩形、文字绘制及样式编辑
- **v0.4** 现代化UI，左侧工具栏，右侧坐标轴优化，TradingView风格的缩放手感

## 📄 许可证

[MIT](LICENSE)