import { init, trackEvent as _trackEvent } from '@q1875759084/monitor';

// __DEPLOY_ENV__ 由 webpack.common.js DefinePlugin 注入，dev 环境值为 'dev'
declare const __DEPLOY_ENV__: string;

/**
 * 监控 SDK 薄封装
 *
 * 职责：组装 appKey / reportUrl / env 等初始化参数，对外暴露业务语义的事件函数。
 * 不在这里实现采集逻辑，采集能力全部来自 @q1875759084/monitor SDK。
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

// ——— 业务事件 ———
// 在此集中定义所有埋点，避免事件名散落在各页面组件中

/** 用户开始转换（上传文件 / 粘贴 URL） */
export const trackConvertStart = (source: 'file' | 'url') =>
  _trackEvent('convert_start', { source });

/** 转换任务完成 */
export const trackConvertDone = (durationMs: number) =>
  _trackEvent('convert_done', { duration_ms: durationMs });

/** 转换任务失败 */
export const trackConvertError = (reason: string) =>
  _trackEvent('convert_error', { reason });

/** 用户点击下载音频 */
export const trackDownload = () =>
  _trackEvent('download_click');
