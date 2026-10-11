module.exports = (api) => {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // babel-preset-expo 的 WebView 配置以 { loose, useBuiltIns } 降级对象展开，输出裸 Object.assign。
      // typebox 等模块导入了名为 Object 的绑定，会遮蔽全局 Object；严格模式改用 runtime helper。
      ['@babel/plugin-transform-object-rest-spread', { loose: false, useBuiltIns: false }],
    ],
  }
}
