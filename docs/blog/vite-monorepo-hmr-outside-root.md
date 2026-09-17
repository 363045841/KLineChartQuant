# Vite monorepo HMR 时灵时不灵：root 之外的源码为什么监听不住

> 现象一句话版：`pnpm dev` 下改 `packages/vue/src` 或 `packages/core/src`，浏览器有时更新、有时纹丝不动，重启 dev server 必然见效——症状是概率性的，和改了什么无关。

这篇文章记录一次开发体验问题的完整定位与修复：为什么 Vite 的 watcher 会漏掉 monorepo 里的源码变更，为什么「给根目录加个 watch」不等于修好，以及我们最后把「监听集合」和「源码解析集合」绑成同一个不变量。

---

## 一、现象：改了源码，浏览器不动

`pnpm dev` 起的是 `packages/vue` 的预览服务器：

```bash
# packages/vue/package.json
"dev": "vite --config preview/vite.config.ts"
```

改 `packages/vue/src/components/*.vue`，或者 `packages/core/src/**/*.ts`，浏览器有时热更新、有时保持旧代码。因为「时灵时不灵」，很容易先怀疑 HMR 缓存、浏览器缓存、编辑器保存方式——但真因在更上游：**变更事件根本没进到 Vite 的 watcher**。

## 二、定位：root 和它要服务的源码不在同一棵树

preview 配置里的 root 是 `packages/vue/preview`：

```ts
// packages/vue/preview/vite.config.ts
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  // ...
})
```

而实际加载的库源码全在 root 之外：

- `preview/App.vue` 相对导入 `../src/index`（`packages/vue/src`）；
- `resolve.alias` 把 core 的导出映射到 `packages/core/src`；
- `resolve.alias` 把 agent-runtime 映射到 `packages/agent-runtime/src`。

Vite 建 watcher 时只递归监听 root，外加 config、env、public：

```js
const watcher = chokidar.watch(
  [
    ...(config.experimental.bundledDev ? [] : [root]),
    ...config.configFileDependencies,
    ...getEnvFilesForMode(config.mode, config.envDir),
    ...(publicDir && publicFiles ? [publicDir] : []),
  ],
  resolvedWatchOptions,
)
```

（vite 8.3.0 `dist/node/chunks/node.js:24288`，内置 chokidar 3.6.0。）

`packages/vue/src`、`packages/core/src`、`packages/agent-runtime/src` 都不在这个数组里。目录树递归监听没有覆盖它们，问题就出在这里。

## 三、为什么是「概率性」：root 外的文件靠逐文件补挂

Vite 对 root 外的文件并非完全不监听。它在文件被加载进模块图时，调用 `ensureWatchedFile` 把**这一个文件**单独补进 watcher：

```js
function ensureWatchedFile(watcher, file, root) {
  if (
    file &&
    // 只需要处理 root 之外的文件
    !file.startsWith(withTrailingSlash(root)) &&
    // 部分 rollup 插件用 \0 开头的私有 id
    !file.includes('\0') &&
    fs.existsSync(file)
  ) {
    watcher.add(path.resolve(file))
  }
}
```

（vite 8.3.0 `node.js:2449`，调用点在 transform 流水线 `node.js:8361`。）

关键差异是：这是**逐文件、加载时**的补挂，不是目录树递归监听。于是有三类稳定的失效场景：

1. **新增文件**在首次被加载之前不会进入 watcher；
2. **文件被删除重建**（编辑器安全写、清理 `dist`）后，原单文件 watch 失效；
3. **Windows** 上单文件 `fs.watch` 的事件更容易丢。

这三点都与「改了什么」无关，只与「文件当下的监听状态」有关，所以症状表现为概率性；一旦重启 dev server，所有已加载文件重新补挂，必然生效。这也解释了为什么 `packages/vue/src` 和 `packages/core/src` 表现一致——它们同属 root 外。

## 四、「让 root 覆盖源码」只解决一半

一个自然的想法是：把 root 提到仓库根，让 watcher 自动覆盖所有包。这能解决「被监听」，但解决不了另一半——**被加载的到底是不是源码**。

core 和 agent-runtime 是通过 `resolve.alias` 才落到 `src` 的。如果去掉 alias，import 会经 `workspace:*` 软链和 package `exports` 落到 `dist`。`dist` 里是构建产物，改源码当然不会影响它，也就谈不上 HMR。

所以真正要维持的不变量是：

> **被 alias 解析到 `src` 的文件集合，必须落在被 watcher 监听的目录树集合之内。**

把 root 提到仓库根会让监听集合变大到覆盖一切，但解析集合仍需 alias 单独维护。两半缺一不可。

## 五、解法：把 workspace 源码目录整树加入 watcher

修复落在唯一的 dev 入口 `packages/vue/preview/vite.config.ts`：加一个插件，在 `configureServer` 阶段把各包的 `src` 目录**整树**加入 watcher。

```ts
/**
 * 收集所有 workspace 包的源码目录 packages/<pkg>/src。
 * 直接扫描 packages 目录，新增包会自动纳入，无需维护清单。
 */
function collectWorkspaceSourceDirs(repoRoot: string): string[] {
  const packagesDir = path.join(repoRoot, 'packages')
  if (!existsSync(packagesDir)) return []
  return readdirSync(packagesDir)
    .map((name) => path.join(packagesDir, name, 'src'))
    .filter((dir) => statSync(dir, { throwIfNoEntry: false })?.isDirectory())
}

/**
 * 把 workspace 源码目录整树加入 watcher，使 root 外源码获得与 root 内一致的目录监听。
 */
function watchWorkspaceSources(repoRoot: string): Plugin {
  return {
    name: 'klinechart:watch-workspace-sources',
    configureServer(server) {
      server.watcher.add(collectWorkspaceSourceDirs(repoRoot))
    },
  }
}
```

三个设计点：

- **目录树，而不是单文件。** `chokidar.add(dir)` 是递归监听，新增、删除、重写文件全部覆盖，等价于文件本来就在 root 内。
- **扫描 `packages/*/src`，而不是维护一份清单。** 新增 workspace 包自动纳入，不会因为漏挂目录而复发同一问题。
- **只加 `src`，不加整包。** `dist` 不在监听集合里，因此不需要额外的 `watch.ignored` 降噪，也不会因为构建产物抖动误触发。

补一句：Vite 文档提示 linked 包需要出现在依赖图中才能触发 HMR。preview 配置里已有 `optimizeDeps.exclude: ['@363045841yyt/klinechart-core']`，这一半本来就是对的——缺的只是监听。

## 六、验证：不用开浏览器

HMR 是否触发难以在单测里断言，但「watcher 到底在监听什么」可以直接查。用同一个 config 以 `middlewareMode` 起服务器，等 watcher ready，读 `server.watcher.getWatched()`：

```js
const server = await createServer({
  configFile: '.../packages/vue/preview/vite.config.ts',
  server: { middlewareMode: true },
})
await new Promise((resolve) => server.watcher.once('ready', resolve))

const watchedDirs = Object.keys(server.watcher.getWatched())
```

结果：

```text
watched packages/core/src: 111 dirs         OK
watched packages/vue/src: 19 dirs           OK
watched packages/agent-runtime/src: 11 dirs OK
add event (new file in packages/core/src):  OK
```

在 `packages/core/src` 下新建一个文件能触发 `add` 事件——这正对应第三节里失效场景 1，修复前不会发生。

## 七、同源问题：examples/vue-test

`examples/vue-test` 是按包名导入的：

```ts
import { KLineChart } from '@363045841yyt/klinechart'
import { formatTimestamp } from '@363045841yyt/klinechart-core'
```

它经 package `exports` 解析到 `dist`（`packages/vue/package.json` 的 `exports` 指向 `./dist/*`）。这个 example 的定位是**发布产物冒烟测试**，把它 alias 到 `src` 会改变它的用途，所以正确的处理不是给它的源码加监听，而是把边界写清楚：改库源码后要 `pnpm build:packages`；需要源码级 HMR 就用 `pnpm dev`。README 里已补上这条说明。

## 八、沉淀下来的三条原则

1. **排查 HMR「时灵时不灵」，先看实际监听集合。** `server.watcher.getWatched()` 一眼看穿，比怀疑缓存高效得多。
2. **把「监听集合」和「解析到源码的集合」绑成同一个不变量。** monorepo 里它们分别由 watcher root 和 `resolve.alias` 决定，很容易各自漂移；只要保证 `alias 到 src` ⊆ `watcher 监听`，HMR 才可靠。
3. **修根因用目录树 + 派生，别去补失效的单文件 watch。** 「逐文件补挂」本身就是薄弱环节，正确的做法是让 root 外的源码重新获得目录级监听。

## 结语

这个问题的表象是「HMR 概率性失效」，本质是 **dev server 的 root 与它服务的源码不在同一棵树**：目录树监听覆盖不到，退化成逐文件补挂，而逐文件监听在新增、删除重建和 Windows 上都不可靠。修复不是给某个文件再补一次 watch，而是把 workspace 的源码目录整树交回给 watcher，并确保它与 alias 解析的集合同源。

---

*相关代码：KLineChartQuant，改动位于 `packages/vue/preview/vite.config.ts` 与 `examples/vue-test/README.md`（issue #194）。可参考 Vite 官方 `server.watch` 文档，以及 vitejs/vite#16399「root 外文件 rename 后 HMR 断链」——同一个 `ensureWatchedFile` 根因。*
