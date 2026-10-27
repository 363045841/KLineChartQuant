<!-- 用途：说明 CTP connector 当前交付范围与真实环境人工验证入口。 -->
# CTP：SimNow / OpenCTP 接入

当前阶段提供原生 SDK 自检、只读合约查询及原始行情快照录制。
K 线聚合、HTTP 历史及 SSE 要在真实样本验证后接入，当前不会出现在可用图表来源列表。

独立后端 [KCQ-CTP-connector](https://github.com/TsekaLuk/KCQ-CTP-connector)
放在本仓库同级 `KCQ-CTP-connector/`，可用 `pnpm setup:backends` 克隆。
没有账号也可以审阅代码、运行离线自检和边界测试。先在后端目录安装：

```sh
uv sync --frozen --link-mode copy
uv run --frozen --no-sync python diagnose.py --sdk-only
uv run --frozen --no-sync python -m unittest discover -s tests -v
```

真实登录尚未经验证。有账号的贡献者可将 `config.example.toml` 复制为本地 `config.toml`，
填写当前官方前置和自己的账号。
密码可通过 `CTP_PASSWORD` 提供；不要发进聊天或提交 Git。
先保留空 `recording_symbols` 查询真实合约，再选择目录中的原始代码录制：

```sh
uv run --frozen --no-sync python diagnose.py --seconds 30
```

回到 KCQ 目录启动：

```sh
pnpm connector ctp
pnpm dev -c ctp
```

默认本地服务 `127.0.0.1:8093`。访问 `/diagnostics` 查看 SDK、登录、目录和行情状态。
`/health` 表示进程存活，不表示行情可用。`ctp` 不纳入 `all`。

来源身份分别为 `ctp-simnow`、`ctp-simnow-replay`、`ctp-openctp-replay`。
OpenCTP 7x24 是循环回放，且需要匹配版本的 TTS 原生库，不能只换前置 IP。
Mac 标准 CTP 已完成离线 API 创建/释放自检；实际登录仍待账号验证。
Mac TTS 尚未验证；Linux/Windows TTS 的准备和双库指纹核验见后端 README。

原始快照按环境及运行批次写入后端 `data/` 下的 SQLite；停机区间不补造数据。
第一阶段遇断线、队列溢出或写库失败会明确停止采集，需人工检查后重启。
首次安装没有历史；后续分钟线将从真实录制开始积累。
