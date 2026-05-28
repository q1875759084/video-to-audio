const { merge } = require('webpack-merge');
const common = require('./webpack.common');

module.exports = merge(common, {
  mode: 'development',

  // eval-cheap-module-source-map：构建快，精确到行，保留 Babel 转译前的 TS/JSX 源码定位
  devtool: 'eval-cheap-module-source-map',

  devServer: {
    port: 3001,
    historyApiFallback: true, // SPA history 路由刷新兜底
    hot: true,
    open: true,
    // webpack-dev-server v5 的 proxy 格式改为数组
    proxy: [
      {
        context: ['/api'],
        target: 'http://localhost:3002',
        changeOrigin: true,
        secure: false,
      },
    ],
  },
});
