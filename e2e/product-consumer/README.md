# 已发布包消费验收

独立项目，只从 npm 安装 `@363045841yyt/klinechart`，然后挂载 `KlineWorkbench`。
用来回答一个问题：**用户 `npm install` 之后，这个组件能不能用。**

和 `scripts/fixtures/vue-product` 的区别：

| | `scripts/fixtures/vue-product` | 本目录 |
|---|---|---|
| 依赖来源 | 本地 `file:*.tgz` | npm registry |
| 源码页 | 有 alias 指向 `packages/vue/src` | 没有，全部走 `node_modules` |
| 用途 | 发布前门禁，能阻断上传 | 发布后回读，只能报警 |

## 目录

```text
package.json          # 钉住要验证的发布版本
pnpm-workspace.yaml   # 空包列表：自己作为 workspace 根，避免被根仓库 link
main.ts               # 消费者入口，只 import 包的公开 API
source.ts             # 确定性行情，只用包的公开类型
check.spec.ts         # Playwright 断言
```

## 本地运行

```bash
cd e2e/product-consumer
pnpm install
pnpm check
```

`check` = 类型检查 + 生产构建 + Chromium 断言。截图在 `test-results/`。

## CI

`.github/workflows/verify-published.yml`：

- `workflow_dispatch`：手动输入版本号
- `workflow_run`：`release.yml` 成功后自动跟随，版本号取自 tag

失败不阻断发布（包已上传），只把这次发布标记为不可用，并上传截图。

## 约束

- **不要**把本目录加进根 `pnpm-workspace.yaml`。根仓库里有同名包 `packages/vue`，一旦进入 workspace，pnpm 会 link 本地源码，验证就失去意义。
- **不要**加任何指向 `packages/*/src` 的 alias。
- 版本号必须显式写死；CI 用 `pnpm add <name>@<version>` 覆盖。
