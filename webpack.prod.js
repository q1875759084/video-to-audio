const { merge } = require('webpack-merge');
const common = require('./webpack.common');

module.exports = merge(common, {
  mode: 'production',

  // 生产不输出 source map，避免源码泄露
  devtool: false,
});
