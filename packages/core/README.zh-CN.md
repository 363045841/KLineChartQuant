# @363045841yyt/klinechart-core

无头、响应式 K 线（蜡烛图）图表引擎，零框架依赖。

## 概述

`@363045841yyt/klinechart-core` 是为 `@363045841yyt/klinechart` monorepo 提供驱动力的基础图表引擎。它负责数据管理、渲染协调、视口计算和插件编排——完全不依赖任何 UI 框架。

## 安装

```bash
npm install @363045841yyt/klinechart-core
# 或
pnpm add @363045841yyt/klinechart-core
# 或
yarn add @363045841yyt/klinechart-core
```

## 快速开始

```typescript
import { createChartController } from '@363045841yyt/klinechart-core/controllers'
import type { KLineData } from '@363045841yyt/klinechart-core'

const controller = createChartController({
  container: document.getElementById('chart'),
  data: [],
  initialZoomLevel: 3,
  theme: 'light'
})

// 加载数据
const data: KLineData[] = [
  { timestamp: 1704067200000, open: 100, high: 105, low: 98, close: 103, volume: 10000 },
  // ...
]
controller.setData(data)

// 使用完毕后清理
controller.dispose()
```

## 导出内容

### 控制器
- `createChartController` —— 创建图表实例的工厂函数
- `ChartController` —— 主控制器接口

### 响应式系统
- `Signal<T>` —— 用于状态管理的响应式原语
- `effect`、`peek` —— 响应式工具函数

### 引擎
- `ChartController` —— 公开图表接口（通过 `@363045841yyt/klinechart-core/controllers` 导入）
- `createChartController` —— 创建控制器实例的工厂函数
- 渲染器（内部使用 —— 请通过 controllers 门面访问）

### 插件系统
- `PluginHost` —— 插件注册与生命周期管理
- `EventBus` —— 跨组件通信
- `StateStore` —— 全局状态管理

### 类型
- `KLineData` —— K 线数据点
- `ChartViewport` —— 视口状态
- `InteractionSnapshot` —— 交互状态

### 子路径导出

该包提供细粒度的子路径导入，支持 Tree-shaking：

```typescript
// 控制器（推荐）
import { createChartController } from '@363045841yyt/klinechart-core/controllers'
import type { ChartController } from '@363045841yyt/klinechart-core/controllers'

// 工具函数（也可通过 controllers 重新导出导入）
import { zoomLevelToKWidth } from '@363045841yyt/klinechart-core/controllers'

// 配置
import { DEFAULT_SETTINGS } from '@363045841yyt/klinechart-core/config'

// 插件
import { EventBus } from '@363045841yyt/klinechart-core/plugin'

// 版本
import { VERSION } from '@363045841yyt/klinechart-core/version'
```

## 架构

```
┌─────────────────────────────────────┐
│          控制器 (Controllers)        │  ← 高层 API
├─────────────────────────────────────┤
│         插件系统 (Plugin System)     │  ← EventBus、StateStore
├─────────────────────────────────────┤
│           引擎 (Engine)             │  ← Chart、ChartStore
├─────────────────────────────────────┤
│         渲染器 (Renderers)           │  ← Canvas/WebGL 渲染器
├─────────────────────────────────────┤
│       响应式系统 (Reactivity)        │  ← 基于 Signal 的状态管理
└─────────────────────────────────────┘
```

## ChartController API

### 创建控制器

```typescript
import { createChartController } from '@363045841yyt/klinechart-core/controllers'

const controller = createChartController({
  container: HTMLElement,
  data: KLineData[],
  initialZoomLevel?: number,
  zoomLevels?: number,
  theme?: 'light' | 'dark',
  yPaddingPx?: number,
  minKWidth?: number,
  maxKWidth?: number
})
```

### 方法

- `setData(data: KLineData[]): void` —— 更新图表数据
- `setTheme(theme: 'light' | 'dark'): void` —— 切换主题
- `zoomToLevel(level: number, anchorX?: number): void` —— 缩放到指定级别
- `zoomIn(anchorX?: number): void` —— 放大
- `zoomOut(anchorX?: number): void` —— 缩小
- `addIndicator(definitionId: string, role: 'main' | 'sub', params?): string` —— 添加指标
- `removeIndicator(instanceId: string): boolean` —— 移除指标
- `dispose(): void` —— 清理并销毁

### 响应式状态

通过 Signal 访问响应式状态：

```typescript
// 当前视口
controller.viewport.subscribe((vp) => {
  console.log('缩放级别:', vp.zoomLevel)
})

// 活跃指标
controller.indicators.subscribe((inds) => {
  console.log('活跃指标:', inds)
})

// 交互状态
controller.interactionState.subscribe((state) => {
  console.log('悬停:', state.hover)
})
```

## 语义化配置

对于 AI/LLM 驱动的图表配置，可使用语义化控制器：

```typescript
import { SemanticChartController } from '@363045841yyt/klinechart-core/semantic'

const semantic = new SemanticChartController(chartInstance)

// 应用自然语言配置
semantic.applyConfig({
  "stockSymbol": "AAPL",
  "dateRange": { "start": "2024-01-01", "end": "2024-06-01" },
  "indicators": ["MA20", "MACD", "RSI"],
  "chart": {
    "chartType": "candlestick",
    "theme": "dark",
    "gridLines": { "horizontal": true, "vertical": false }
  },
  "display": {
    "paneRatios": { "main": 0.6, "sub1": 0.4 }
  }
})
```

## 浏览器支持

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

需要支持以下特性：
- ResizeObserver
- Canvas 2D Context
- ES2022（或转译）

## 许可证

MIT © 363045841

## 相关包

- `@363045841yyt/klinechart` —— Vue 3 绑定
- `@363045841yyt/klinechart-react` —— React 绑定（即将推出）
- `@363045841yyt/klinechart-angular` —— Angular 绑定（即将推出）