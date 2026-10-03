# 指标展开与收起按钮的品种选择条件

未选择品种时，默认主图指标仍可能发布图例行，因此不能只依据指标行数量显示展开与收起按钮。

Chart 向 Legend DOM renderer 注入读取当前品种选择状态的函数，直接查询 dataManager.symbols，不保存额外状态。主图图例更新时，仅在已选择品种且存在指标行的情况下显示按钮。

按钮的 `display:flex` 会覆盖浏览器对 `hidden` 的默认样式，因此显式使用 `.klc-legend-collapse[hidden] { display:none; }` 确保按钮整体隐藏。

DOM 测试覆盖未选择品种、选中品种，以及收起后清除品种的按钮显示状态，同时检查计算后的 `display`。
