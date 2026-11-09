# Mac 安装包构建与发布

Mac 按系统兼容档位和 CPU 架构提供四个独立 DMG，同一版本的文件名不会互相覆盖：

| 档位 | 最低系统 | CPU | 文件名后缀 | Electron | Go |
| --- | --- | --- | --- | --- | --- |
| standard | macOS 13.0 | Intel | macos13-x64.dmg | 项目锁定版本（当前 45.2.2） | 1.27.3 |
| standard | macOS 13.0 | Apple Silicon | macos13-arm64.dmg | 项目锁定版本（当前 45.2.2） | 1.27.3 |
| macos12 | macOS 12.0 | Intel | macos12-x64.dmg | 43.8.7 | 1.26.10 |
| macos12 | macOS 12.0 | Apple Silicon | macos12-arm64.dmg | 43.8.7 | 1.26.10 |

例如 `KLineChart Quant-0.11.0-macos12-x64.dmg` 供 Intel Mac 的 macOS 12 使用，
包括 12.7.6。macOS 13 及以上优先使用对应架构的 standard 包；M 系列共用 arm64 包。
最低系统声明不是所有新系统及机型都已完成真机验收的承诺。

## 构建入口

手动运行 `desktop.yml`，`platforms` 填 `macos` 会生成四个 Mac 包，填 `all` 还包含
Windows 与 Linux。只构建一个包时可填 `macos12-x64`、`macos12-arm64`、
`macos13-x64` 或 `macos13-arm64`；多个目标用逗号分隔。产物在对应 Actions run 的
Artifacts 中，保留七天。该工作流不发布 npm 或 GitHub Release。

本机 Mac 构建需先安装项目规定的 Node/pnpm 和所选档位的 Go，再在仓库根目录执行：

```sh
pnpm install --frozen-lockfile
pnpm build:product
pnpm --filter @363045841yyt/klinechart-desktop build:mac --profile macos12 --arch x64
```

换成 `--profile standard` 选择标准版，`--arch arm64` 选择 Apple Silicon。
脚本会重建 `resources/backends` 中的生成文件，禁止 Go 自动升级工具链，并检查
实际 `.app` 中各 Mach-O 的架构和最低系统版本。构建机自身不必运行 macOS 12。
默认 Electron 依赖、Windows/Linux 构建及应用版本号不随兼容档位改变。

## 兼容依赖与维护

档位的唯一配置源为 `scripts/macos-build-profiles.mjs`。兼容版同时固定 Electron、
主进程 Node 24 编译目标、渲染端 Chromium 150 编译目标和 Go 1.26 工具链，
不能只修改 `LSMinimumSystemVersion`。

标准后端仍由 `backends.json` 固定。兼容版额外读取 `backends-macos12.json`，仅覆盖
GoTDX 仓库及提交：该提交基于标准版相同的服务代码，调整 Go 声明和 gotdx 依赖以
满足 Go 1.26；Binance 保持同一固定提交。兼容提交目前位于贡献者公开 fork，合并前
维护者可将其接收至上游并替换该固定来源。切换档位时按配置中的源仓库抓取提交，
不依赖缓存副本原来的 origin。

兼容版依赖较旧 Electron 支持线，需要单独跟进安全更新：
[Electron 44 起停止支持 macOS 12](https://www.electronjs.org/blog/electron-44-0)，
[Go 1.26 为最后支持 macOS 12 的 Go 系列](https://go.dev/doc/go1.26#darwin)。

## 正式交付

提交 PR，由项目维护者按审查规则合并并创建版本标签。现有 `release.yml` 保留原来的
npm 产品验收和发布流程，随后用同一矩阵与构建步骤把四个 Mac DMG 及 Windows/Linux
安装包上传到对应 GitHub Release。不要为临时验证运行该正式发布工作流。
DMG 不提交进 Git；本次配置变更本身也不代表四种产物已全部通过真机测试。
