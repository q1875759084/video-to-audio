# 开发记录

## 问题修复与功能迭代

---

### 2026-05-29（部署流程 & 双环境）

#### [文档] CI/CD 流程与双环境部署设计

**涉及文件**：
- `video-to-audio/.github/workflows/deploy.yml`
- `video-to-audio-backend/.github/workflows/deploy.yml`
- `infra/.github/workflows/deploy-video-frontend.yml`
- `infra/.github/workflows/deploy-video-backend.yml`
- `infra/video-to-audio/docker-compose.dev.yml`
- `infra/video-to-audio/docker-compose.prod.yml`

**双环境端口**：

| 环境 | 前端端口 | 说明 |
|------|---------|------|
| 测试（dev） | `3091` | 手动触发，供验证用 |
| 生产（prod） | `3090` | 测试通过后手动晋级 |

前后端各自独立部署（`--no-deps`），互不干扰。前后端 volume 也按环境隔离（`vta-db-dev` / `vta-db-prod`），测试数据不会污染生产。

**完整部署流程**：

```
push 任意分支
  └→ 自动触发 CI（type-check + build），只做代码卡点，不部署

手动 run workflow → 选 deploy-dev
  └→ CI 通过
  └→ 构建 Docker 镜像，tag 为 git sha（不可变，可追溯）
  └→ 推送到 Docker Hub
  └→ 触发 infra 仓库 deploy-video-frontend/backend（environment=dev）
  └→ 服务器部署到测试环境（端口 3091）

测试验证通过后 → 手动 run workflow → 选 deploy-prod + 填写 tag（如 v1.0.0）
  └→ CI 通过
  └→ 不重新构建镜像，只给测试阶段的 sha 镜像追加语义版本 tag
  └→ 触发 infra 仓库（environment=prod）
  └→ 服务器部署到生产环境（端口 3090）
```

**一次构建原则**：

生产部署不重新执行 `docker build`，而是用 `docker buildx imagetools create` 对已有 sha 镜像追加语义版本 tag（纯 manifest 操作，不产生新镜像层）。保证测试验证过的镜像和上线的镜像是同一个二进制产物，消除"测试是 A 构建、生产是 B 构建"的风险。

**与 security 项目的对比**：

security 的生产端口是 `80`（占用 HTTP 默认端口），video 因为要与 security 共存于同一台服务器，只能用非标准端口（`3090`/`3091`）。两个项目的 workflow 设计完全一致，触发方式对称。

---

### 2026-05-29（CI 环境修复）

#### [修复] CI 依赖安装失败：本地 lock 文件 resolved 地址指向美团内网源

**涉及文件**：
- `video-to-audio/.npmrc`（新增）
- `video-to-audio-backend/.npmrc`（新增）
- `video-to-audio/.github/workflows/deploy.yml`
- `video-to-audio-backend/.github/workflows/deploy.yml`
- `video-to-audio/package-lock.json`（重新生成）
- `video-to-audio-backend/package-lock.json`（删除）

**根本原因**：

本地 `~/.npmrc` 全局配置了美团内网 npm 镜像源 `https://r.npm.sankuai.com/`，导致本地生成的 `package-lock.json` 里每个包的 `resolved` 字段都指向该内网地址。`npm ci` 严格按 lock 文件的 `resolved` URL 下载包，GitHub Actions 运行在公网，无法访问内网地址，导致安装失败。

**为什么本地能过、CI 不能过**：

| 环境 | lock 文件 resolved | npm 命令 | 结果 |
|------|-------------------|----------|------|
| 本地 | `r.npm.sankuai.com`（内网） | `npm install` | ✅ node_modules 已存在跳过重下 |
| CI | `r.npm.sankuai.com`（内网） | `npm ci` | ❌ 公网无法访问内网地址 |

**为什么 security 项目没有这个问题**：

security-backend 的 `package-lock.json` 没有 `resolved` 字段（生成时的环境差异），`npm install` 直接用当前 registry 拉包，GitHub Actions 默认用 `registry.npmjs.org`，完全不受本地内网配置影响。

**修复方案**：

1. 在两个项目根目录各新增一个 `.npmrc`，指定公网 registry：
   ```
   registry=https://registry.npmjs.org
   ```
   项目级 `.npmrc` 优先级高于全局 `~/.npmrc`，本地和 CI 都会读到这个配置。

2. 前端重新生成 `package-lock.json`（resolved 全部变为 `registry.npmjs.org`）。

3. 后端 `package-lock.json` 因本地 Python 3.14 的 `better-sqlite3` 原生编译问题无法重新生成，直接删除 lock 文件，CI 用 `npm install` 临时安装（同 security-backend 的做法）。

4. 两个 workflow 统一改为 `npm install`，不再使用 `npm ci`，与 security 项目风格对齐。

**关键细节 — lock 文件的 resolved 字段**：

`npm ci` 和 `npm install` 对 lock 文件的处理方式不同：
- `npm ci`：严格按 lock 安装，包括验证 `resolved` 地址，无 lock 文件直接报错
- `npm install`：lock 只用于锁版本，resolved 地址不可达时会自动用当前 registry 重新拉取

lock 文件里有无 `resolved` 字段取决于生成时的 npm 版本和 registry 配置，并非格式版本（`lockfileVersion: 3`）决定。

---

#### [功能] 任务队列：防止并发任务打满服务器资源

**涉及文件**：`video-to-audio-backend/src/services/convert/queue.ts`

每个转换任务会在服务器上启动 1 个 `yt-dlp` + 1 个 `ffmpeg` 子进程，均为 CPU 密集型操作。无并发限制时用户可无限提交，并发数超过 CPU 核数后只会让所有任务变慢。

**方案**：
- `MAX_CONCURRENT = 3`：全局同时运行的任务上限（≈ CPU 核数）
- `MAX_PER_USER = 2`：单用户「运行中 + 排队中」任务总数上限

**关键细节 — 单用户上限必须同时统计排队中的任务**：

只统计运行中会有漏洞：全局满载时用户任务全在排队，`countRunning = 0`，用户可无限入队绕过限制，等全局一空载就同时涌入。正确做法是统计 `countRunning + countQueued`，在入口处拦截。

---

#### [功能] yt-dlp 补充请求头伪装，降低被平台识别为爬虫的风险

**涉及文件**：`video-to-audio-backend/src/services/convert/ytdlp.ts`

原始调用没有任何请求头参数，部分平台会根据 User-Agent 和 Referer 识别非浏览器请求。

**方案**：补充以下 yt-dlp 参数：
- `--user-agent`：伪装为真实 Chrome 浏览器
- `--add-header Accept-Language`：模拟正常浏览器语言特征

说明：B 站等平台的视频流（DASH 格式）音频轨与画质无关，`-f bestaudio/best` 选取独立音频流，无需登录即可获取最高音频质量。

---

#### [功能] SSE 新增 queued 事件，前端展示排队等待状态

**涉及文件**：
- `video-to-audio-backend/src/services/convert/queue.ts`（推送时机）
- `video-to-audio/src/hooks/useSSE.ts`（事件处理）
- `video-to-audio/src/types/sse.ts`、`src/types/convert.ts`（类型定义）
- `video-to-audio/src/pages/Home/components/ConvertPanel/index.tsx`（UI 状态）

任务提交后若全局并发已满，进入排队等待。原来前端无感知，用户不知道任务是否在执行。

**方案**：
- 后端任务入队时通过 SSE 推送 `queued` 事件
- 前端状态机新增 `queued` 状态，展示「排队等待中，前方有任务正在执行...」
- SSE 连接在任务排队期间即建立，无需轮询，`queued → progress → done` 自然流转

---

#### [功能] 429 响应携带活跃任务信息，刷新页面后可恢复监听

**涉及文件**：
- `video-to-audio-backend/src/services/convert/queue.ts`（暴露 `getActiveTaskIds`）
- `video-to-audio-backend/src/database/task/index.ts`（新增 `getTasksByIds`）
- `video-to-audio-backend/src/controllers/convert/index.ts`（429 响应携带 `activeTasks`）
- `video-to-audio/src/utils/request.ts`（`ApiError` 携带完整 `response`）
- `video-to-audio/src/api/convert.ts`（`TaskLimitError` 透传 `activeTasks`）
- `video-to-audio/src/hooks/useChunkUpload.ts`（新增 `onTaskLimited` 回调）
- `video-to-audio/src/types/convert.ts`（新增 `blocked` 状态、`ActiveTaskSummary`）
- `video-to-audio/src/pages/Home/components/ConvertPanel/`（`blocked` UI + 恢复监听）

**问题**：用户提交任务后刷新页面，React 状态清空，后端任务仍在运行。再次提交时被 429 拦截，只提示"您已有 1 个任务正在进行"，用户不知道是哪个任务、也无法恢复监听进度。

**方案**：

1. **后端 429 响应附带任务摘要**：`queue.ts` 新增 `activeTaskIds[]` 与 `activeUserIds[]` 同索引对应，通过 `getActiveTaskIds(userId)` 获取「运行中 + 排队中」的任务 ID 列表，再经 `getTasksByIds()` 批量查库，返回每个任务的 `taskId`、`source`（URL 或文件名）、`type`、`format`、`status`。

2. **前端错误透传链路**：
   - `request.ts` 的响应拦截器改为抛 `ApiError`（含完整 `response`），不再丢失扩展字段
   - `api/convert.ts` 捕获 `ApiError(code=429)` 后抛 `TaskLimitError`（含 `activeTasks`）
   - `useChunkUpload` 新增 `onTaskLimited` 回调，与普通 `onError` 区分开

3. **前端 `blocked` 状态 UI**：
   - 状态机新增 `blocked` 状态（区别于 `error`：不是失败，是有任务在跑）
   - 展示每个活跃任务：格式徽标 + 来源缩略（URL 只保留域名+路径尾部）+ 排队/转换中
   - 「恢复监听」按钮：直接将该任务的 `taskId` 接入 SSE，恢复 `queued → progress → done` 事件流，无需重新提交

**关键细节 — `ApiError` vs 普通 `Error`**：

原拦截器 `reject(new Error(message))` 会丢弃 `response.data`，导致 `activeTasks` 无法传到调用方。改为 `reject(new ApiError(message, response))` 后，调用方通过 `instanceof ApiError` 判断并读取扩展数据，同时不影响其他正常错误的处理路径。
