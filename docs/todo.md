# 功能 Todo

> 记录待实现的功能性改进，侧重面试价值与技术含量。
> 系统稳定性、架构深度方向见 `depth-roadmap.md`。

---

## P0 健壮性补全

提升项目从 "Demo 级" 到 "生产级" 的关键，面试时被追问必须能答上来。

- [ ] **SSE 断连重连**：网络抖动或页面切换后，前端自动重连 SSE 并恢复进度显示
- [ ] **上传失败重试**：上传中断后给出明确提示，支持手动或自动重试（限 3 次）
- [ ] **错误边界**：为转换流程关键节点（上传、转换、下载）加 React Error Boundary，降级展示友好文案

---

## P1 视频时间裁剪

技术含量最高的功能，涉及前端交互设计、与后端 ffmpeg 协议对接。

- [ ] **前端时间轴选择器**：拖拽选取起止时间，展示当前帧预览（`<video>` + `currentTime` 驱动）
- [ ] **后端裁剪接口**：接收 `startTime` / `endTime`，后端用 `-ss` / `-to` 参数调用 ffmpeg 完成精确裁剪
- [ ] **精度说明文案**：向用户说明关键帧精度限制（GOP 边界问题），管理预期

**面试价值**：能展开讲帧级别精度问题、HTTP Range 与 ffmpeg `-ss` 的区别，以及前后端协议设计。

---

## P1 前端性能优化

补足当前项目性能实践的空白，提供具体可量化的数据。

- [ ] **首屏加载分析**：跑 Lighthouse，记录 FCP / LCP 基线数据
- [ ] **Code Splitting**：对历史记录、视频下载等重型模块做路由级懒加载（`React.lazy` + `Suspense`）
- [ ] **历史记录列表虚拟滚动**：当记录条数较多时引入虚拟列表，防止 DOM 节点堆积

---

## P2 前端监控 SDK（跨项目）

体现"上线后负责"的工程意识，同时覆盖 carry-hub、security-quiz-game 等其他个人项目。
架构：**通用 SDK（`@daibao/monitor`）→ 发布 npmjs.com → 各项目薄封装**，对齐企业私有 npm 模式。

### Phase 1：跑通链路
- [ ] **SDK 骨架**：创建 `@daibao/monitor` 包，暴露 `init / trackEvent / reportError` 三个 API
- [ ] **错误采集**（`error.ts`）：全局捕获 `onerror` + `unhandledrejection`，统一格式化后入队
- [ ] **上报队列**（`reporter.ts`）：优先用 `navigator.sendBeacon`，降级 `fetch`；100ms 内批量合并上报，支持重试
- [ ] **后端接收**：在 `video-backend` 加 `POST /collect` 路由，入库 SQLite（字段：`appKey / type / name / url / timestamp`）
- [ ] **video-to-audio 接入**：在 `src/utils/monitor.ts` 薄封装，验证数据到达

### Phase 2：补全能力
- [ ] **性能采集**（`perf.ts`）：用 `web-vitals` 采集 FCP / LCP / CLS / FID / TTFB
- [ ] **白屏检测**（`blank-screen.ts`）：对角线多点 `elementsFromPoint` 采样，全命中容器节点则判定白屏
- [ ] **发布 npm**：发布到 npmjs.com（公开包），版本管理走 semver

### Phase 3：多项目接入
- [ ] carry-hub、security-quiz-game 各加 `src/utils/monitor.ts` 薄封装，`appKey` 区分来源
- [ ] 简单数据大盘：查询 `/collect` 数据，展示各项目错误率 / 白屏次数 / 性能分位数

**面试价值**：能讲清楚"平台能力 vs 业务消费"分层设计、`sendBeacon` 与 `fetch` 的取舍、白屏检测的采样方案。
