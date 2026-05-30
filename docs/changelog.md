# 功能迭代记录

---

### 2026-05-30

#### [修复] 移动端下载慢且文件格式错误（.vdat）

**涉及文件**：
- `video-to-audio/src/pages/Home/components/ConvertPanel/ResultPanel.tsx`
- `video-to-audio-backend/src/middleware/auth.ts`
- `video-to-audio-backend/src/routes/file/index.ts`

下载逻辑从 `fetch + Blob URL + a.click()` 改为 `window.location.href` 直接跳转，解决国产浏览器拦截程序触发下载导致的格式错误和延迟问题。同时新增 `fileDownloadAuthMiddleware` 支持 query token，供浏览器原生下载鉴权使用。详见 `notes.md`「移动端兼容」章节。

---

#### [修复] B 站链接代理：socks5h 协议 + socket-timeout

**涉及文件**：`video-to-audio-backend/src/services/convert/ytdlp.ts`

代理协议经历三次迭代才稳定：
- `http://`：代理不支持 HTTPS CONNECT 隧道，返回 503
- `socks5://`：本地 DNS 解析后传裸 IP，代理 ACL 拒绝，返回 Errno 4
- `socks5h://` + `--socket-timeout 30`：代理服务器做 DNS 解析，稳定可用

详见 `notes.md`「代理协议选择」章节。

---

#### [修复] 代理 IP 动态化，通过快代理 API 获取

**涉及文件**：`video-to-audio-backend/src/services/convert/ytdlp.ts`

新增 `getKdlProxy()` 函数，每次调用 yt-dlp 前先请求快代理 `getkpsbyid` API 获取当前有效 IP，替代硬编码地址，避免代理 IP 每天更换后需要手动修改配置。

---

### 2026-05-29

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

---

#### [修复] 手机下载音频文件类型识别错误 + 无下载反馈

**涉及文件**：
- `video-to-audio-backend/src/controllers/file/index.ts`（后端）
- `video-to-audio/src/pages/Home/components/ConvertPanel/ResultPanel.tsx`（前端）
- `video-to-audio/src/pages/Home/components/HistoryList/HistoryItem.tsx`（前端）

**问题1：iOS/Safari 下载的文件类型不对**

后端下载接口 `Content-Type` 设置为 `application/octet-stream`，iOS Safari 收到该类型后无法识别文件是音频，保存时缺少扩展名或显示为未知文件。

**修复**：下载接口改为返回正确的音频 MIME 类型：

```
mp3 → audio/mpeg
aac → audio/aac
wav → audio/wav
```

同时补充了 `Content-Length` 响应头（利于浏览器显示下载进度）和 `filename*=UTF-8''...`（RFC 5987 编码，确保各端文件名正确）。

**问题2：手机点击下载按钮后无任何反馈（卡顿感）**

前端 `handleDownload` 使用 `fetch` 将整个文件载入内存再触发下载，手机网络慢时等待时间长，按钮没有任何状态变化，用户不知道是否在处理中，容易误以为没响应而重复点击。

**修复**：新增 `downloading` 状态，下载期间按钮显示「下载中...」并禁用，防止重复触发。

---

#### [修复] B 站链接多种格式兼容：从用户粘贴文本中提取真实 URL

**涉及文件**：`video-to-audio-backend/src/controllers/convert/index.ts`

**问题**：用户从 B 站复制的链接往往不是纯 URL，有三种常见格式：

| 来源 | 实际粘贴内容 |
|------|------------|
| 浏览器地址栏 | `https://www.bilibili.com/video/BV1qp4y1v7Rn/` |
| PC 端分享按钮 | `【视频标题】 https://www.bilibili.com/video/BV1qp4y1v7Rn/?...` |
| APP 端分享 | `【视频标题-哔哩哔哩】 https://b23.tv/7zzjrYh` |

后两种格式直接传给 `yt-dlp` 会因为非法 URL 报错。

> **说明**：`b23.tv` 短链本身从最初版本就能用，`yt-dlp` 原生跟随 HTTP 302 重定向，无需额外处理。这次修复的是"标题文字和链接混排"导致整体不是合法 URL 的问题。

**方案**：在控制器入口处新增 `extractUrl(input)` 函数，先于 `yt-dlp` 调用执行：

1. 用正则 `/https?:\/\/[^\s\u3000-\u303f\uff00-\uffef]+/` 扫描文本，取第一个 `http(s)://` 开头、遇到空白字符或全角标点停止的串
2. 去除末尾可能残留的中文标点（句号、引号、括号等）
3. 用 `new URL(url)` 做合法性验证，失败则返回 `null` 并提前 400

前端 `UrlInput` 的 `placeholder` 同步更新为「支持直接粘贴分享文本」，无需用户手动裁剪链接。
