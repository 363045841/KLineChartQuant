# Worker 数据所有权与二进制通信

## 依据与范围

实际 Chrome 原生采样已将大块分配解析到 DedicatedWorker.postMessage、
DedicatedWorkerGlobalScope.postMessage 与 ValueSerializer.ExpandBuffer。
本次重构消除行情全量对象和绘图大数组的逐次结构化克隆，不宣称覆盖全部进程占用。

## 输入

同步状态归每个物理 Worker 端口所有，不归脚本 ID 或池的逻辑槽位所有。
主线程保存当前行情和本次跨周期请求的数值基线，Worker 保存对应领域 Bar 序列。
首次传全量，后续比较实际值，发送首个变化位置之后的数值块与最终长度。
同一协议支持末根更新、追加、历史修正、补历史、截断和清空。
closed 的缺省、显式 undefined、false、true 均保真。

调用方行情不转移，专用通信块通过 transfer list 转移。
不保留跨周期序列的历史版本；本次未使用的序列立即从两端同步状态移除。
release 清空两端基线，端口销毁清除发送侧状态，新 Worker 从全量开始。
发送失败直接销毁失配端口，由现有池故障恢复机制重建，不回退到旧对象协议。
脚本计算失败仍保留已同步行情，防止下一次增量基线错位。

## 输出

数值点、OHLC、逐点颜色索引、fill 颜色、drawing ID/层次与锚点使用一个数值块。
颜色与重复锚点 ID 使用响应内字符串字典；PVP 矩形共同的声明与样式只传一次。
复杂自定义 params/labels 保留既有可克隆语义，不用 JSON.stringify 替代对象通信。
接收端恢复公开 PlotCollection，保留空值、字段缺省、字符串时间和可选字段。
复用传输声明时为每个 drawing 恢复独立可变对象，避免图形之间共享样式产生串改。
不缓存历史结果、不建立无界 buffer 池；响应处理完成后通信块即失去协议引用。

## 验收

codec 测试使用实际 structuredClone transfer，验证通信块 detach、调用方数据不变、
输入各种历史变化与跨周期移除、实际脚本结果往返以及 drawing 样式隔离。
Node 线程桥接与发布产物验收都传递 transfer list，禁止以普通复制替代实际转移。
现有实时合并调度与 Worker 池并发/取消语义保持，复测脚本计算和跨层生命周期。
进程内存下降量仍需相同真实 BTCUSDT 配置的前后 trace 验证。
