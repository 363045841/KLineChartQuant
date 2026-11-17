## 🔀 NexusAI Fork

This repository is **KCQ-NexusAI**, a public fork of [KLineChartQuant](https://github.com/363045841/KLineChartQuant) maintained by [EliteOtaku](https://github.com/EliteOtaku). All credit for the charting engine goes to the upstream author — this fork only adds:

- **NexusAI Shell** (`packages/nexus-shell`): a generic, business-decoupled TradingView-style host shell (React + Vite). Top bar / drawing toolbar / indicator panel / template system skeleton / theme tokens. MIT, free to reuse.
- **Analytics collector and options pipeline** (`packages/analytics`, `deploy/`): collects options aggregates, the raw option chain at a five-minute cadence, volume splits and orderflow into per-day gzip shards, and serves them over a local read-only HTTP API. Its deployment — NAS, Linux host, Docker or a local machine — and the single source of its configuration live in [deploy/README.md](./deploy/README.md).
- **Engine enhancements** accumulated on `nexus/main` and offered back upstream in small, focused batches (`pr/*` branches): builtin data-source registration for the web component, `4h` period, drawing selection timing fix, TV-style drawing templates.

Branch model: `main` mirrors upstream (fast-forward only); `nexus/main` is the fork integration line. See [NOTICE](./NOTICE) for attribution details.
