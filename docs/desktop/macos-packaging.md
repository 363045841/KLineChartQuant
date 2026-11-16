# Mac 安装包构建与发布

Mac 只发 macOS 13 (Ventura) 及以上的两个 DMG，文件名带系统档位与架构：

| 最低系统 | CPU | 文件名 |
| --- | --- | --- |
| macOS 13.0 | Intel | `KLineChart Quant-<version>-macos13-x64.dmg` |
| macOS 13.0 | Apple Silicon | `KLineChart Quant-<version>-macos13-arm64.dmg` |

Electron 版本由 `packages/desktop-electron/package.json` 的 `electron: ^45.2.2` 决定
（只能停在 45.x）；Go 用 setup-go 的 `stable`（当前 1.27.x，产出的二进制最低 macOS 13）。
不提供 macOS 12 包：Electron 44 起 Chromium 移除 macOS 12，Go 1.27 起也要求 macOS 13，
继续支持只能锁在已停止维护的 Electron 43 线。

## 构建入口

手动运行 `desktop.yml`，`platforms` 填 `macos` 会生成两个 Mac 包，填 `all` 还包含
Windows 与 Linux。只构建一个包时可填 `macos13-x64` 或 `macos13-arm64`；多个目标用
逗号分隔。产物在对应 Actions run 的 Artifacts 中，保留七天。该工作流不发布 npm 或
GitHub Release。

本机 Mac 构建需先安装项目规定的 Node/pnpm 和 Go，再在仓库根目录执行：

```sh
pnpm install --frozen-lockfile
pnpm build:product
pnpm --filter @363045841yyt/klinechart-desktop build:mac --arch x64
```

换成 `--arch arm64` 构建 Apple Silicon 包。在 macOS 上直接执行
`pnpm --filter @363045841yyt/klinechart-desktop build` 也会转到这条路径（按当前架构），
不会绕过最低系统声明和校验。脚本会重建 `resources/backends` 中当前架构的生成文件，
并按档位写入最低系统、产物名，再检查实际 `.app` 中各 Mach-O 的架构和最低系统版本；
产品名从打包配置读取，不在此硬编码。

## 档位与最低系统

系统档位、最低版本和架构的唯一配置源为 `scripts/macos-desktop-target.mjs`。最低系统
同时写进 `LSMinimumSystemVersion` 和产物文件名（`macos13`），不能只改 plist。

`minimumSystemVersion` 是**上限**：`scripts/check-macos-package.mjs` 要求包内每个
Mach-O（含随包的 Go connector）声明的 `minos` 都不高于它。因此升级 Electron 或 Go
之后如果它们抬高了最低系统，构建会直接失败——此时要么同步提升档位与文档，要么退回
仍支持 macOS 13 的工具链，不会在无提示的情况下产出"标着 13 实际要 14"的包。

## 正式交付

提交 PR，由项目维护者按审查规则合并并创建版本标签。现有 `release.yml` 保留原来的
npm 产品验收和发布流程，随后用同一矩阵与构建步骤把两个 Mac DMG 及 Windows/Linux
安装包上传到对应 GitHub Release。不要为临时验证运行该正式发布工作流。
DMG 不提交进 Git；配置变更本身也不代表所有产物都已通过真机测试。
