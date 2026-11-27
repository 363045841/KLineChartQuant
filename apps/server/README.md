# klinechart-server

Node 宿主复用浏览器的行情、定义、脚本执行、计算和警报模块。进程拥有一份运行时，使用 Node EventSource、`worker_threads`、脚本文件和 `node:sqlite`。

## 构建与启动

要求 Node 26。

```bash
pnpm --filter @363045841yyt/klinechart-server... build
node apps/server/dist/main.js --port=8787 --db=./data/state.db --scripts=./data/scripts --workers=4 --sources=gotdx,binance
```

参数全部必填。数据库的父目录需提前创建。`--workers` 是执行线程数，另有一条编译线程。`--sources` 只启用指定的内置数据源。

服务监听 `127.0.0.1`，开放 `GET /health`、`GET /alerts` 和 `GET /fires`。警报规则与触发记录通过同一个 SQLite 文档提交，首次启动会导入旧的两份文档。外部投递渠道可订阅 `AlertService` 的通知。

```bash
pnpm --filter @363045841yyt/klinechart-server test:node
```

验收从构建产物加载服务与实际 Worker，检查 Node 模块边界，并验证保存的规则在延迟探测后从 SSE 接收数据、触发、落库和恢复。
