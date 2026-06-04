import { init } from '@q1875759084/monitor';

// __DEPLOY_ENV__ 由 webpack.common.js DefinePlugin 注入，dev 环境值为 'dev'
declare const __DEPLOY_ENV__: string;

/**
 * 监控 SDK 薄封装
 *
 * 职责：组装 appKey / reportUrl / env 等初始化参数。
 * 不在这里实现采集逻辑，采集能力全部来自 @q1875759084/monitor SDK。
 *
 * 待 SDK 完成 track.ts 后，在此补充业务埋点函数。
 */
export function initMonitor() {
  const isDev = __DEPLOY_ENV__ === 'dev';
  init({
    appKey: 'video-to-audio',
    // 上报地址：dev 时 /api 由 webpack-dev-server proxy 转发到本地后端
    reportUrl: '/api/monitor/collect',
    env: isDev ? 'development' : 'production',
    debug: isDev,
  });
}
