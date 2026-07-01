高性能金融图表库，单帧生成时间仅需2ms，在200Hz环境下稳定实现190fps流畅滚动，原生支持AI Agent控制，全链路ResizeObserver驱动清晰渲染，采用可插拔架构。

<div align="center">

[English](README.md) | 简体中文

# KLineChartQuant

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
  <br/>
  <img src="https://files.seeusercontent.com/2026/06/20/Wp3o/I5_VJIL2D4VNPMUZC5E3C.png" width="400" style="border-radius: 12px; margin: 8px;" />
  <img src="https://files.seeusercontent.com/2026/06/20/0flS/1YHDQQB321JZ5QW.png" width="400" style="border-radius: 12px; margin: 8px;" />
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
npm install @363045841yyt/klinechart @363045841yyt/klinechart-core
```

- **使用组件：** 

```vue
<template>
  <div class="app-container" :data-theme="currentTheme">
    <KlineChart v-model:theme="currentTheme" :custom-data="customData" />
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { type CustomDataSource, KlineChart } from '@363045841yyt/klinechart'
  import demoData from './demo-data.json'

  const currentTheme = ref<'light' | 'dark'>('dark')

  const customData = ref<CustomDataSource>(demoData as CustomDataSource)
</script>

<style>
  .app-container {
    display: flex;
    flex-direction: column;
    height: 80vh;
  }

  .app-container[data-theme='dark'] {
    background: #000;
    color: #e5e7eb;
  }
</style>

```
- **Import CSS in main.ts:**
```typescript
import '@363045841yyt/klinechart/style.css' // <- HERE
import { createApp } from 'vue'
import App from './App.vue'


createApp(App).mount('#app')
```

## 🎨 自定义 Tooltip

`KlineChart` 暴露 `#kline-tooltip` 和 `#marker-tooltip` 插槽，用于自定义 tooltip 渲染。传入插槽后，默认 tooltip 被完全替换，展示内容和样式完全由你控制。

### `#kline-tooltip`

| 插槽属性              | 类型                                          | 说明                              |
| --------------------- | --------------------------------------------- | --------------------------------- |
| `hoverData`           | `KLineData`                                   | 当前悬停的 K 线数据（非 null）    |
| `hoveredIndex`        | `number \| null`                              | 数据索引                          |
| `data`                | `ReadonlyArray<KLineData>`                    | 全量数据数组                      |
| `tooltipStyle`        | `CSSProperties`                               | 预计算的绝对定位样式              |
| `upColor` / `downColor`| `string`                                     | 当前主题的涨跌颜色                |

```vue
<KlineChart v-model:theme="currentTheme">
  <template #kline-tooltip="{ hoverData, tooltipStyle, upColor, downColor }">
    <div :style="tooltipStyle" class="custom-tooltip">
      <div class="custom-tooltip__title">
        <span>{{ hoverData.stockCode }}</span>
        <span>{{ formatTimestamp(hoverData.timestamp, { timeZone: 'Asia/Shanghai' }) }}</span>
      </div>
      <div class="custom-tooltip__price"
           :style="{ color: hoverData.close >= hoverData.open ? upColor : downColor }">
        {{ hoverData.close.toFixed(2) }}
      </div>
      <div class="custom-tooltip__detail">
        O: {{ hoverData.open.toFixed(2) }} H: {{ hoverData.high.toFixed(2) }}<br>
        L: {{ hoverData.low.toFixed(2) }} C: {{ hoverData.close.toFixed(2) }}
      </div>
    </div>
  </template>
</KlineChart>

<script setup lang="ts">
  import { formatTimestamp } from '@363045841yyt/klinechart-core'
</script>

<style scoped>
  .custom-tooltip {
    padding: 8px 12px;
    border-radius: 8px;
    background: rgba(30, 30, 30, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #fff;
    font-size: 12px;
    pointer-events: none;
    backdrop-filter: blur(6px);
  }
  .custom-tooltip__title {
    display: flex; justify-content: space-between; gap: 12px;
    font-weight: 600; margin-bottom: 4px;
  }
  .custom-tooltip__price {
    font-size: 18px; font-weight: 700; margin-bottom: 4px;
  }
  .custom-tooltip__detail { opacity: 0.7; }
</style>
```

### `#marker-tooltip`

| 插槽属性              | 类型                                                            | 说明           |
| --------------------- | --------------------------------------------------------------- | -------------- |
| `marker`              | `MarkerEntity \| CustomMarkerEntity \| null`                    | 悬停的标记数据 |
| `tooltipStyle`        | `CSSProperties`                                                  | 预计算样式     |

## 📖 更多文档

- [渲染引擎架构](./docs/rendering-engine-architecture.md) —— 核心渲染管线与物理像素对齐机制
- [插件系统](./docs/PLUGIN_SYSTEM.md) —— 扩展机制与自定义开发
- [渲染器开发指南](./docs/renderer-development-guide.md) —— 自定义渲染器开发

## 📋 组件属性

| 属性              | 类型                    | 默认值            | 描述                                                                                               |
| ----------------- | ----------------------- | ----------------- | -------------------------------------------------------------------------------------------------- |
| semanticConfig    | `SemanticChartConfig`   | —                 | 语义化配置（可选）。传入后驱动图表数据、指标、标记和选项                                           |
| dataFetcher       | `DataFetcher`           | 内置              | 数据获取函数，默认为代理 `/api/stock` 的内置请求器                                                 |
| theme             | `'light' \| 'dark'`     | —                 | 图表主题。可用 `v-model:theme` 双向绑定                                                            |
| isFullscreen      | `boolean`               | —                 | 全屏状态（受控）。不传则使用组件内部非受控模式                                                     |
| timezone          | `string`                | `'Asia/Shanghai'` | 时区                                                                                               |
| yPaddingPx        | `number`                | 20                | Y轴内边距（像素）                                                                                  |
| minKWidth         | `number`                | 1                 | 最小K线宽度（逻辑像素）                                                                            |
| maxKWidth         | `number`                | 50                | 最大K线宽度（逻辑像素）                                                                            |
| rightAxisWidth    | `number`                | 0                 | 右侧价格坐标轴宽度                                                                                 |
| leftAxisWidth     | `number`                | 0                 | 左侧价格轴宽度（0=隐藏）                                                                           |
| bottomAxisHeight  | `number`                | 24                | 底部时间坐标轴高度                                                                                 |
| priceLabelWidth   | `number`                | 60                | 价格标签的额外宽度，用于显示涨跌幅                                                                 |
| zoomLevels        | `number`                | 20                | 缩放等级总数                                                                                       |
| initialZoomLevel  | `number`                | 3                 | 初始缩放等级（1 ~ zoomLevels）                                                                     |
| customData        | `CustomDataSource`      | —                 | 内联数据包：`{ symbol?, period?, data, comparisons? }`。完全绕过数据请求器，直接使用传入的数据渲染 |
| teleportContainer | `string \| HTMLElement` | —                 | 下拉/弹窗的 Teleport 目标容器（CSS 选择器或元素）。默认渲染到内部 `.chart-wrapper`                 |
| mcp               | `McpConfig`             | —                 | MCP/AI runtime 桥接配置：`{ wsUrl?, autoReconnect?, onToolCall? }`                                 |

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
