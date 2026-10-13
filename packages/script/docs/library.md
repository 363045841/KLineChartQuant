# 函数库

库是加载进脚本 VM 的 JavaScript 源码，统一走一套协议。

## 声明与使用

```js
// 在一个脚本可用的库源码里声明
defineLibrary('stats', {
  mean(values) {
    return (values[0] + values[1]) / 2
  },
})

// 在指标脚本里使用
onBar() {
  plot(stats.mean([open, close]), PlotKind.Line, { id: 'mean' })
  // 等价：importLibrary('stats').mean([open, close])
}
```

`defineLibrary(name, members)` 校验名称不与已有全局冲突，并把成员对象设为只读全局。
`importLibrary(name)` 取回同名库。

## 加载

内置 `ta` 库通过显式 manifest（`quickjs/impl/builtinLibraries.ts`）注册，
使用与用户库完全相同的 `defineLibrary` 调用。宿主通过脚本服务注入额外库源码：

```ts
import { createScriptService } from '@363045841yyt/klinechart-script-chart'

const scripts = await createScriptService([
  { name: 'stats', source: statsLibrarySource },
])
```

宿主可用 TypeScript 声明合并 `LibraryModules` 为已知库补充类型：

```ts
declare module '@363045841yyt/klinechart-script' {
  interface LibraryModules {
    stats: { mean(values: number[]): number }
  }
}
```

库运行在同一个 QuickJS Context 内，受相同的时间和内存限制。
