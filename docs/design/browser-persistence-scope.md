# 浏览器工作区持久化范围

SaaS 宿主需要隔离不同账户和工作区的布局、自选列表、图表设置和 Agent 偏好。
在动态导入 Vue/React 图表之前，从 Core 的 `persistence-scope` 子路径调用
`configureBrowserPersistenceScope(scope)`。该子路径不导入图表或创建存储。

所有 Core LocalStorage 和 IndexedDB 持久化实例捕获创建时的范围，不修改浏览器
全局 API。首次创建存储后禁止更换范围；账户退出、工作区切换应销毁页面并重新
加载，模块级缓存和旧异步回调不会跨范围复用。独立的 Agent runtime 会话存储
需用 `scopedPersistenceName` 生成其 `databaseName`。

未配置范围的库预览保持原来的存储名称；SaaS 产品不自动读取或迁移旧的共享
数据。命名空间是浏览器数据分区，不是权限边界：同源脚本仍可访问其他分区，
云端数据操作必须验证登录会话与组织成员关系。
