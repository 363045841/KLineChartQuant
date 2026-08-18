# 从一次 Vite 解析失败到单一事实来源

## 问题场景

项目是 pnpm workspace monorepo。`@363045841yyt/klinechart-core` 是发布包，生产消费者通过
`packages/core/package.json` 的 `exports` 使用其公开入口；Vue preview、React preview、Electron
renderer 和部分 Vitest 配置则为了直接编译 core 源码，使用 Vite alias 将这些包入口映射到
`packages/core/src`。

新增行情数据公共入口后，core 已正确声明：

```json
{
  "exports": {
    "./market-data": {
      "types": "./dist/data/provider/index.d.ts",
      "import": "./dist/data/provider/index.js"
    }
  }
}
```

Vue 代码也通过公共 API 使用它：

```ts
import { sourceRouter } from '@363045841yyt/klinechart-core/market-data'
```

但 GitHub Pages preview 构建失败：

```text
Rolldown failed to resolve import
"@363045841yyt/klinechart-core/market-data"
```

本地的单元测试没有暴露问题，因为 Vitest 已经从 `exports` 自动生成 alias；只有 preview 的
Vite 配置还维护着另一份手写的 core 子路径列表，且其中漏掉了 `market-data`。

## 根因

同一份包边界被维护在两个地方：

1. `packages/core/package.json` 的 `exports`：面向发布产物的正式公共 API。
2. 各开发构建配置中的 alias：面向源码构建的映射。

第二份列表是对第一份列表的人工复制。新 export 被加入第一处，却没有同步到所有 Vite 配置，
于是发布 API、测试环境和 preview 构建环境对“哪些子路径合法”得出了不同结论。

这不是 `market-data` 特有的问题。任何新的 core export 都可能在某一个手写列表中遗漏；不同
consumer 又可能在不同时间失败。直接补一条 `market-data` alias 能让这次构建通过，但不会消除
这种漂移机制，因此只是治标。

## 修复方法

新增 `scripts/core-source-aliases.mjs`，由
`createCoreSourceAliases(coreSrc)` 读取 core package 的 `exports`，将每个发布入口映射到对应的
源码 TypeScript 文件：

```text
@363045841yyt/klinechart-core/market-data
  -> packages/core/src/data/provider/index.ts
```

Vue preview、React preview、Electron renderer，以及 Vue、Angular、AI runtime 的 Vitest 配置
都改为调用这个 helper，不再各自维护 core 子路径列表。

helper 的约束和保护如下：

- 每个 export 使用带 `^` 和 `$` 的精确正则匹配，防止短路径前缀误匹配更深的子路径。
- 读取 `import` 条件并将 `./dist/**/*.js` 转成对应的 `src/**/*.ts` 文件。
- 初始化时验证 `package.json` 与每个目标源码文件存在；错误的 export 映射会在启动构建或测试时
  立即失败，而不会在运行时才暴露。
- `engine/renderers/Indicator` 的深层源码文件保留一个兜底 alias。它服务于未声明为发布 export 的
  内部开发入口，且放在精确 export 规则之后，避免覆盖公开入口。

这样，`package.json` 的 `exports` 成为公开子路径的唯一事实来源；开发环境只负责把这份契约投影
到源码目录。

## 为什么不改为使用 dist

preview 选择编译 `packages/core/src` 有实际原因：它需要开发时直接联编 workspace 源码，并对
decorator TypeScript 代码应用 Babel transform。强制先构建 core、再让 preview 使用 `dist`，会改变
现有开发链路，也无法解决“构建配置和包公开边界有两份定义”的设计问题。

因此正确的边界不是放弃源码 alias，而是让源码 alias 从公开边界自动推导。

## 验证

使用与 CI 相同的命令验证：

```bash
pnpm exec vite build --config packages/vue/preview/vite.config.ts --base /KLineChartQuant/
```

构建成功，`@363045841yyt/klinechart-core/market-data` 已被解析到
`packages/core/src/data/provider/index.ts`。构建仍会给出 bundle 大小和无效动态 import 的既有警告，
但不再有模块解析错误。

## 吸取的教训

### 不要复制包边界

`exports`、TypeScript paths、Vite alias、测试 resolver 都是在描述“模块从哪里可以被导入”。若它们
独立手写，就会形成多个会漂移的事实来源。应选择一个权威定义，并由工具配置派生。

### 测试通过不等于发布链路正确

这里 Vitest 能解析新入口，GitHub Pages preview 却不能。测试、库构建、demo/preview 和 Electron
打包的 resolver 配置不完全相同；新增公开入口时，至少应运行实际发布或部署使用的构建命令。

### alias 应精确匹配

字符串或前缀 alias 容易让
`@363045841yyt/klinechart-core/engine/renderers/Indicator` 误匹配其更深的
`Indicator/indicatorCatalog` 子路径。对公开入口使用完整 specifier 的正则匹配，能让映射行为与
`exports` 的子路径语义一致。

### 让配置错误尽早失败

从 dist 路径推导 source 路径存在约定。helper 在加载时检查目标文件，能把“新增 export 但没有源码
文件”转为明确的配置错误，避免把错误延迟到 Rolldown 的解析阶段。

## 后续约定

新增或修改 core 的公开子路径时：

1. 更新 `packages/core/package.json` 的 `exports`。
2. 确保对应的 `src` 入口文件存在。
3. 不在 preview、Electron 或 Vitest 配置中手写新增 alias。
4. 运行受影响的实际构建命令，尤其是 deploy preview。

这套约定把新增 API 的维护点收敛为一个，并使遗漏变成自动检查可以发现的问题。