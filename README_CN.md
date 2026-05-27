高性能金融图表库，单帧生成时间仅需2ms，200hz环境下稳定滚动190-200fps，原生支持 AI Agent 控制，全链路 ResizeObserver 驱动清晰渲染，插件化架构。

<div align="center">

[English](README.md) | 简体中文

# 📈 KLineChartQuant

**渲染清晰 · 高性能 · 交互优化**

[![npm version](https://img.shields.io/npm/v/@363045841yyt/klinechart.svg?style=flat&color=blue)](https://www.npmjs.com/package/@363045841yyt/klinechart) [![npm downloads](https://img.shields.io/npm/dm/@363045841yyt/klinechart.svg?style=flat&color=green)](https://www.npmjs.com/package/@363045841yyt/klinechart) [![license](https://img.shields.io/npm/l/@363045841yyt/klinechart.svg?style=flat&color=orange)](https://github.com/363045841/klinechart/blob/main/LICENSE) [![demo](https://img.shields.io/badge/Demo-在线体验-purple?style=flat)](https://363045841.github.io/KLineChartQuant/)

[![qq](https://img.shields.io/badge/QQ-672011965-blue?style=flat)](https://qm.qq.com/q/672011965) [![tg](https://img.shields.io/badge/Telegram-加入群组-26A5E4?style=flat&logo=telegram)](https://t.me/+1o-6B-wVRTU2MjQ9)

</div>

---

轻量级金融 K 线图表库，专注量化交易场景。**Agent 是一等公民** — 支持 AI Agent 直接控制图表操作，提供 TradingView 级别的交互体验。

<div align="center">
  <img src="https://files.seeusercontent.com/2026/05/18/7Zjf/pasted-image-1779120668142.webp" width="400" style="border-radius: 12px; margin: 8px;" />
  <img src="https://files.seeusercontent.com/2026/05/18/cAw4/pasted-image-1779120665492.webp" width="400" style="border-radius: 12px; margin: 8px;" />
  <br/>
  <img src="https://files.seeusercontent.com/2026/05/18/Xwq2/pasted-image-1779120662730.webp" width="400" style="border-radius: 12px; margin: 8px;" />
  <img src="https://files.seeusercontent.com/2026/05/18/Lb5p/7MNQT2E_2X1UL3626R.png" width="400" style="border-radius: 12px; margin: 8px;" />
</div>

## ✨ 核心特性

- **Agent 优先** - 支持 AI Agent 直接控制图表，缩放、平移、绘制均可程序化调用
- **渲染清晰** - 全链路 ResizeObserver 驱动，物理像素对齐，各 DPR 屏幕下 K 线、影线、线条均锐利清晰
- **插件架构** - 渲染器插件化设计，支持动态注册、配置和生命周期管理
- **自定义标记** - 支持语义化配置自定义标记和自定义信息
- **高性能** - 流畅处理万级数据点，无卡顿缩放平移；**200Hz 屏幕下支持 190-200fps**，单帧生成时间低至 **2ms**
- **WebGL 渲染** - K 线、成交量柱、MACD 柱通过 WebGL 渲染，GPU 加速，**200Hz 屏幕下可达 190fps**，每帧 GPU 耗时 **<1ms**
- **交互优化** - 缩放锚点稳定、十字光标精准、拖拽流畅

## 🚀 快速开始

### 前置要求

KLineChart 需要股票数据后端支持。请确保 `kmap` 与 `stockbao` 处于同一目录下：

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

后端启动后，API 地址为 `http://localhost:8000`

### 3. 安装并使用

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

## 📖 更多文档

- [渲染引擎架构](./docs/rendering-engine-architecture.md) - 核心渲染管线与物理像素对齐机制
- [插件系统](./docs/PLUGIN_SYSTEM.md) - 扩展机制与自定义开发
- [渲染器开发指南](./docs/renderer-development-guide.md) - 自定义渲染器开发

## 📋 组件 Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|---------|-------------|
| semanticConfig | `SemanticChartConfig` | **必填** | 语义化配置，图表数据和指标的唯一控制源 |
| yPaddingPx | `number` | 0 | Y轴上下留白像素 |
| minKWidth | `number` | 2 | K线最小宽度（逻辑像素） |
| maxKWidth | `number` | 50 | K线最大宽度（逻辑像素） |
| rightAxisWidth | `number` | 0 | 右侧价格轴宽度 |
| bottomAxisHeight | `number` | 24 | 底部时间轴高度 |
| priceLabelWidth | `number` | 60 | 价格标签额外宽度（用于显示涨跌幅） |
| zoomLevels | `number` | 20 | 缩放级别总数 |
| initialZoomLevel | `number` | 3 | 初始缩放级别（1 ~ zoomLevels） |

## 🗺️ Roadmap

- [x] K 线缩放锚点稳定，缩放手感提升
- [x] 右轴脱离滚动容器，彻底解决裁剪问题
- [x] 空白区域支持绘制
- [x] 限制垂直平移范围，防止视口脱离数据
- [x] 绘图系统
- [x] 右轴缩放
- [x] 最新价线与右轴标签样式优化
- [x] 面图元工具及渲染
- [ ] 更多高级绘图工具
- [ ] 支持分钟、多日、月、年 K 线显示
- [ ] 支持将绘制的图形转换为量化代码

## 🚀 What's New

- **v0.6.10** 统一 WebGL 渲染上下文共享，重构副图生命周期管理 — 通过 SubPaneManager 集中管理副图实例，paneId 作为一等标识
- **v0.6.6** 综合渲染优化：价格转坐标批量化、刻度位置与几何数据缓存、月份键值计算优化；**200Hz 屏幕下稳定 190-200fps**，单帧生成时间降至 **2ms**
- **v0.6.3** K 线、成交量柱、MACD 柱支持 WebGL 渲染，大幅提升整体性能
- **v0.6.1** 双层 Canvas 架构：Main + Overlay 分层渲染，引入 UpdateLevel 选择性更新，**200Hz 显示器下稳定 180fps 低抖动**
- **v0.6.0** 重构指标计算管线：MA/BOLL/EXPMA/ENE/RSI/CCI/STOCH/MOM/WMSR/KST/FASTK 统一采用 Calculator → Scheduler → StateStore → Renderer 无状态架构，提升性能与可维护性
- **v0.5.6** 对数价格轴支持，网格线在像素层面均匀分布
- **v0.5.2** 新增高级绘图工具：平行通道、回归趋势、平滑顶底、不相交通道
- **v0.5.0** 完整绘图工具系统，支持直线、矩形、文字绘制与样式编辑
- **v0.4** 现代化 UI，左侧工具栏、右轴优化、TradingView 式缩放手感

## 📄 License

[MIT](LICENSE)
