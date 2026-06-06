import { init } from '@cmjndy/monitor';
import type { MonitorEnv } from '@cmjndy/monitor';

// __DEPLOY_ENV__ 由 webpack.common.js DefinePlugin 注入
// 取值约定：'dev'（本地开发）| 'test'（测试环境）| 'production'（生产环境）
declare const __DEPLOY_ENV__: string;

// ─── 环境 → SDK env 映射 ────────────────────────────────────────────────────
// SDK 的 env 字段只控制「要不要上报」：
//   development → 不上报，debug 模式下 console 打印
//   staging / production → 正常上报
// test 环境需要上报（用于验证监控链路、排查测试环境问题），映射为 'staging'
const ENV_MAP: Record<string, MonitorEnv> = {
  dev:        'development',
  test:       'staging',     // test 环境上报，数据隔离由 reportUrl 指向不同后端实例保证
  production: 'production',
};

// ─── 环境 → 上报地址映射 ────────────────────────────────────────────────────
// 数据隔离靠不同的 monitor-backend 实例，后端本身不感知环境差异
// dev 环境 MonitorEnv='development'，SDK 不会上报，此 Map 中无需包含 dev 项
// test / production：各自服务器的 nginx 同域反代 /monitor/collect 到对应 monitor-backend 实例
const REPORT_URL_MAP: Record<string, string> = {
  test:       '/monitor/collect',
  production: '/monitor/collect',
};

/**
 * 监控 SDK 薄封装
 *
 * 职责：按当前部署环境组装 appKey / reportUrl / env 等初始化参数。
 * 不在这里实现采集逻辑，采集能力全部来自 @cmjndy/monitor SDK。
 */
export function initMonitor() {
  const deployEnv = __DEPLOY_ENV__;

  init({
    appKey: 'video-to-audio',
    // 兜底 'development'：未知环境宁可不上报，避免脏数据污染已有环境的监控数据
    env: ENV_MAP[deployEnv] ?? 'development',
    // 兜底空字符串：dev 环境不会走到上报逻辑，其他未知环境请求会失败但不影响业务
    reportUrl: REPORT_URL_MAP[deployEnv] ?? '',
    debug: deployEnv === 'dev',
  });
}
