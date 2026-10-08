# 宿主管理的行情连接（BYOK）

图表提供统一 Provider 契约与连接管理插槽，宿主负责登录、租户授权、凭据加密、请求代理和供应商权益。KCQ 不收集 API Key，不把凭据写入图表设置、URL 或 localStorage。

## 目录生命周期

`MarketDataProviderRegistry.subscribeCatalog` 仅在注册、注销、清空目录后通知。配置更新不触发目录事件，避免偏好同步循环。Vue 通过作用域订阅维护快照；晚注册的连接进入管理列表与搜索，组件销毁释放订阅。新连接默认启用，已有连接保留开关。

宿主用 `KlineChart` 的 `source-management` 插槽提供连接、测试、替换、断开操作。工具栏和图表设置中的源弹窗共享该入口。无注册源时提供明确空状态。

## 凭据边界

宿主给每个连接一个稳定 source ID 和同源代理 URL，设置 `endpointEditable: false`。图表偏好不得覆盖受管地址；宿主 Transport 也必须固定地址，不信任本地配置。浏览器只接收公开元数据与行情。代理必须验证会话、工作区成员和连接归属，限制请求规模，不回传供应商原始错误或凭据。

显式选择的 Provider 失败时由现有路由直接返回错误，不回退平台额度。自动源路由仍遵守既有规则。删除连接后宿主注销 Provider；工作区切换由宿主重载并切换持久化作用域。

## 供应商接入评估（2026-10-08）

以下是候选清单，不代表 KCQ 内置这些适配器。

| 供应商 | 范围与凭据 | 宿主适配要求 | 官方文档 |
| --- | --- | --- | --- |
| Twelve Data | 股票、外汇、加密；API Key | REST 搜索与历史 K 线；按用户权益返回错误 | https://twelvedata.com/docs |
| Alpaca | 美股、加密；Key ID + Secret | Market Data API；feed 权益与交易权限分离 | https://docs.alpaca.markets/docs/about-market-data-api |
| Massive | 美股、期权、外汇、加密；API Key | 聚合 K 线与参考目录；按订阅权益接入 | https://massive.com/docs/rest/quickstart |
| Finnhub | 多市场；token | 逐市场核对实时/历史数据权益 | https://finnhub.io/docs/api |
| Tushare | 中国市场；token + 积分/权限 | POST 接口，交易日与复权口径适配 | https://www.tushare.pro/document/1 |
| 自有 KCQ V1 Connector | 用户服务器 | 服务端固定白名单、防 SSRF 与重定向；非任意 URL 转发 | docs/market-data/market-data-provider.md |

TradingView 付费会员不是官方行情 API Key。MT5 需要已登录终端与连接器部署。企业 LSEG/Bloomberg 需要正式数据接口及合同，不能视作通用 Key 接口。供应商订阅并不自动包含再分发权；宿主应按使用场景核实许可。这里不编造套餐价格或免费额度。
