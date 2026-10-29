# @363045841yyt/klinechart-web-component

一个 ESM 文件，导入即注册 `<kline-chart>` 自定义元素：完整 UI 的 Vue 图表，能在没有 Vue 运行时的页面里直接使用。

> 本包由 `packages/vue` 的源码构建，但独立发布：不用 Web Component 的项目不会下载这份产物。

## 安装

```bash
pnpm add @363045841yyt/klinechart-web-component
```

需要脚本编辑器时再装可选依赖（AGPL-3.0，未安装时编辑器退化为纯文本）：

```bash
pnpm add @363045841yyt/klinechart-script-server
```

## 使用

导入一次即可注册元素，之后在任意 HTML 中写 `<kline-chart>`：

```ts
import '@363045841yyt/klinechart-web-component'
```

```html
<kline-chart y-padding-px="8" zoom-levels="6" is-fullscreen="false"></kline-chart>
```

基础配置通过 attribute 传入（字符串会按 Vue 的 kebab-case 规则还原成 prop）：

| attribute | 含义 |
| --- | --- |
| `min-k-width` / `max-k-width` | K 线宽度范围 |
| `right-axis-width` | 右侧价格轴宽度 |
| `bottom-axis-height` | 底部时间轴高度 |
| `price-label-width` | 价格标签宽度 |
| `zoom-levels` | 缩放档位数 |
| `initial-zoom-level` | 初始缩放档位 |
| `y-padding-px` | 上下留白 |
| `is-fullscreen` | 是否全屏 |

对象、数组与回调不能走 attribute，要在元素实例上直接赋值；`zoom-level-change`、`toggle-fullscreen` 是元素派发的 DOM 事件。

## 许可证

Apache-2.0。可选的脚本编辑器依赖 `@363045841yyt/klinechart-script-server` 为 AGPL-3.0-or-later。
