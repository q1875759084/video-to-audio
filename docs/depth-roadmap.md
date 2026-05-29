# 纵向深度迭代方向

> 功能性迭代（新增转换格式、历史管理、批量任务等）独立排期，本文档只记录**系统稳定性、架构深度、可观测性**方向的演进目标。
>
> 判断标准：每一项要能回答"**为什么现有方案不够用、你的方案牺牲了什么换来了什么**"，而不只是"做了这个功能"。

---

## 一、任务队列稳定性（video-to-audio-backend）

### 当前缺口

服务重启后内存队列清空，但 SQLite 里状态还是 `pending` / `processing`，
这些任务永远不会被重新调度，形成"僵尸任务"。

### 迭代目标

**启动时扫描并恢复僵尸任务**

- 服务启动时查询 DB 中 `status = 'pending' | 'processing'` 的任务
- 将其重新提交到 `queue.ts`，恢复正常调度
- `processing` 状态的任务需先将 DB 状态重置为 `pending`（进程已死，无法续传，重新来过）
- 前端 SSE 断线重连后收到最新状态，无感知

**要能回答的问题**：
- 恢复时如何避免重复执行？（幂等性）
- 为什么不用 Redis 队列？（单机场景下 SQLite 足够，引入 Redis 增加运维复杂度，这是有意识的 tradeoff）
- 如果是多实例部署，这套方案能用吗？（不能，需要分布式锁 + Redis，说清楚边界）

---

## 二、SSE 断线重连与进度快照（video-to-audio）

### 当前缺口

SSE 断开后（网络抖动、页面切换再回来），前端虽然能"恢复监听"，
但后端没有进度快照——重连后只能等下一次 ffmpeg 进度事件，
如果任务已经跑了 80% 却没有新事件触发，前端进度条会停在 0。

### 迭代目标

**后端维护进度快照，重连时立即推送最新进度**

- 后端在内存中为每个 `taskId` 保存最后一次 `progress` 事件的 `percent` 和 `stage`
- SSE 客户端新建连接时，后端立即推送一次快照事件，前端进度条从正确位置继续
- 快照随任务完成/失败后清除

**要能回答的问题**：
- 快照存内存还是 DB？（内存够用，DB 写入频率太高；但重启后快照丢失，结合任务恢复机制一起说）
- 前端 `@microsoft/fetch-event-source` 的 `Last-Event-ID` 机制能替代这个方案吗？（可以，但需要后端实现事件持久化，复杂度更高）

---

## 三、可观测性：跑通一条真实监控链路（video-to-audio-backend）

### 当前缺口

日志是 `console.log`，没有结构化输出；
任务耗时、失败率、队列积压数这些指标完全不可见。

### 迭代目标

**结构化日志 + 关键指标采集**

- 引入 `pino`（轻量、JSON 输出），替换 `console.log`，统一输出 `taskId`、`userId`、`duration`、`status`
- 在任务完成/失败时记录耗时指标（`convert_duration_ms`、`convert_error`）
- 暴露 `/metrics` 端点（Prometheus 格式），记录：
  - 队列当前长度（`queue_pending_count`）
  - 全局运行中任务数（`queue_running_count`）
  - 任务成功/失败计数（`task_total{status="done|error"}`）

**要能回答的问题**：
- 为什么选 pino 不选 winston？（性能、JSON 原生支持、异步写入）
- Prometheus 拉取 vs 主动上报，各适合什么场景？
- 这套方案如何接入告警？（Grafana AlertManager，或直接在 `/metrics` 外加一层健康检查 + 通知）

---

## 四、微前端 keep-alive + store 隔离（mini-qnh）

### 当前缺口

`AliveScope` 已引入但页面尚未使用 `<KeepAlive>`；
更深的问题是：keep-alive 保活多个 tab 时，Jotai store 如何做页面级隔离——
否则 tab A 的商品编辑状态会污染 tab B。

### 迭代目标

**页面级 JotaiProvider 隔离**

- 对齐原项目：JotaiProvider 加在各页面入口（`pages/goods-edit/index.tsx`），而非应用根部
- 每个保活的页面实例拥有独立的 Jotai store 实例
- 路由切走时 store 随 `<KeepAlive>` 节点一起"冻结"，切回时恢复

**要能回答的问题**：
- 为什么不把 JotaiProvider 放在 App 根部？（多 tab keep-alive 场景下 store 全局共享，无法区分"哪个 tab 的状态"）
- `<KeepAlive>` 保活的组件树和正常挂载的组件树，在 React DevTools 里有什么区别？
- keep-alive 期间 `useEffect` 的 cleanup 会执行吗？（不会，这是 keep-alive 的核心副作用，需要用 `useActivate` / `useUnactivate` 替代）

---

## 五、微前端 CSS 隔离方案对比（micro-frontend-demo）

### 当前缺口

现在只用了 `prefixCls` 做运行时类名隔离，没有实现 Shadow DOM 或属性选择器级别的样式沙箱，
也没有系统性地对比过各方案的边界。

### 迭代目标

**能清晰说明四种 CSS 隔离方案的适用边界**

| 方案 | 原理 | 优势 | 局限 |
|------|------|------|------|
| `prefixCls` | 编译时/运行时修改类名前缀 | 零运行时开销 | 需要组件库支持，第三方库无效 |
| CSS Modules | 编译时加 hash 后缀 | 构建时确定，无副作用 | 动态注入的样式无效 |
| Shadow DOM | 浏览器原生隔离 | 最彻底 | 弹窗/Portal 挂到 body 会逃逸，全局样式失效 |
| 属性选择器沙箱（qiankun） | 运行时重写 `<style>` 标签，加 `[data-qiankun-xxx]` 前缀 | 不需要组件库配合 | 动态插入样式有延迟，性能有损耗 |

在 Demo 里各实现一个，跑通后对比实际表现。

---

## 优先级排序

| 优先级 | 方向 | 原因 |
|--------|------|------|
| P0 | 任务队列稳定性（僵尸任务恢复） | 当前最明显的系统性缺陷，实现难度不高，闭环完整 |
| P0 | SSE 断线重连 + 进度快照 | 与队列恢复配套，共同解决"服务重启 / 网络抖动"场景 |
| P1 | 结构化日志 + 指标暴露 | 让系统从"黑盒"变"可观测"，面试时能具体说数字 |
| P2 | keep-alive + store 隔离 | 技术深度高，但依赖 mini-qnh 先把 KeepAlive 跑通 |
| P2 | CSS 隔离方案对比 | 偏向"理解深度"，实现成本高，优先于其他方向稳定后再做 |
