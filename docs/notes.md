# 问题排查 & 工程心得

> 记录开发过程中遇到的问题、排查过程、以及由此延伸出的工程规范认知。
> 不记录功能迭代，功能迭代见 `changelog.md`。

---

## CI/CD 工程

### npm registry 与 lock 文件的内外网陷阱

**触发场景**：本地开发环境使用美团内网 npm 镜像源（`r.npm.sankuai.com`），导致生成的 `package-lock.json` 里每个包的 `resolved` 字段都指向内网地址。GitHub Actions 运行在公网，无法访问内网，CI 安装依赖失败。

**为什么本地能过、CI 不能过**：

| 环境 | lock 文件 resolved | npm 命令 | 结果 |
|------|-------------------|----------|------|
| 本地 | `r.npm.sankuai.com`（内网） | `npm install` | ✅ node_modules 已存在，跳过重下 |
| CI | `r.npm.sankuai.com`（内网） | `npm ci` | ❌ 公网无法访问内网地址 |

**`npm ci` vs `npm install` 的核心区别**：

- `npm ci`：严格按 lock 文件安装，**包括校验 `resolved` URL 的可达性**，无 lock 文件直接报错
- `npm install`：lock 只用于锁版本，resolved 地址不可达时自动用当前 registry 重新拉取，有容错

lock 文件里有无 `resolved` 字段取决于**生成时的 registry 配置**，与 `lockfileVersion` 版本无关。

**解法**：在项目根目录提交一个 `.npmrc`，指定公网 registry：

```
registry=https://registry.npmjs.org
```

项目级 `.npmrc` 优先级高于全局 `~/.npmrc`，无论开发者本地如何配置，在项目目录下 npm 都只认这个地址。本地生成的 lock 文件 resolved 也会指向公网，CI 直接可用。

---

### 临时切换 npm 镜像源的正确姿势

日常开发中，某个包在当前镜像源下载慢时，临时切换 registry 是常见操作。错误的做法会导致 lock 文件里混入临时 registry 的地址，引发 CI 失败。

**❌ 危险：覆盖项目 `.npmrc`**

```bash
echo 'registry=https://registry.npmmirror.com' > .npmrc  # 覆盖了项目配置！
npm install some-slow-package
# 此时 lock 文件里新包的 resolved 变成 npmmirror.com
# 如果 CI 访问不到，直接失败
```

**✅ 安全：用 `--registry` 参数**

```bash
npm install some-slow-package --registry https://registry.npmmirror.com
```

只影响这一次命令，不写入任何配置文件。但注意：新包的 resolved 仍会被写入 lock 文件。

**✅ 更安全：改全局 `~/.npmrc`，不动项目配置**

```bash
npm config set registry https://registry.npmmirror.com  # 改全局
npm install some-slow-package
npm config set registry https://r.npm.sankuai.com/      # 装完改回来
```

项目级 `.npmrc` 覆盖全局，lock 文件 resolved 仍按项目配置记录。全程不影响 CI。

**操作规范**：永远不要修改项目的 `.npmrc` 文件后提交。临时切换用 `--registry` 参数或改 `~/.npmrc`。

---

## B 站视频下载

### B 站反爬：HTTP 412 / 验证码拦截，云服务器 IP 被标记

**触发场景**：yt-dlp 从云服务器直接请求 B 站链接，返回 HTTP 412 或 `<title>验证码_哔哩哔哩</title>`，下载失败。

**根本原因**：B 站对已知数据中心 IP 段有渐进式风控，即使是国内 IP，只要识别为云主机即触发人机验证。`window._riskdata_` 出现在响应 HTML 中是铁证。此时加 UA、Cookie、Referer 均无效，因为风控的核心是 **IP 类型**，而非请求头。

**排查过程**：

| 尝试方案 | 结果 | 原因 |
|---------|------|------|
| 加 `--user-agent` / `--add-header Referer` | ❌ | 风控不看请求头 |
| `--geo-bypass` | ❌ | 无效，B 站不看 GeoIP |
| `--cookies-from-browser` | ❌ | Cookie 不能改变 IP 类型 |
| `--extractor-args bilibili:player_client=android` | ❌ | yt-dlp 将安卓 UA 解析出 `m.bilibili.com` URL，但 generic extractor 不支持移动端页面 |
| 升级 yt-dlp 到 nightly | ❌ | 同上，安卓模拟方向有限制 |

**最终解法**：引入国内住宅 IP 代理，`--proxy` 参数让 yt-dlp 通过住宅 IP 完成 B 站 API 认证阶段，绕过数据中心 IP 标记。

---

### 代理带宽与两步走下载架构

**问题**：住宅代理的产品定位是 IP 纯净度，不是传输速度，全程走代理下载数据会极慢（实测 ~4 KB/s），7 分钟的视频需要数小时。

**解法：两步走，代理只用于认证，数据直连下载**

```
旧方案（全程走代理，极慢）：
B站链接 → yt-dlp（--proxy → 下载数据）→ 数小时

新方案（代理仅获取直链，直连下载数据）：
B站链接 → yt-dlp -g（--proxy → 获取 CDN 直链，<1s）
         → wget（无代理，直连服务器带宽 5-10 Mbps）→ 30-60 秒
```

**核心原理**：B 站 CDN 直链（`bilivideo.com`）对来源 IP 没有限制，签名参数只验证有效期（约 10 分钟），不绑定 IP。代理只需参与 B 站 API 认证阶段（流量极小），实际视频数据走服务器直连满速下载。

**实现要点**：
- `yt-dlp -g` + `--proxy`：通过代理调用 B 站 API，返回带签名的 CDN 直链，不下载任何数据
- `wget -O outputPath directUrl`：直连下载，不携带代理
- B 站 bestaudio 通常为 `m4a` 格式，固定输出为 `source.m4a`，ffmpeg 可直接处理
- 直链有效期约 10 分钟，获取后须立即下载，不可缓存

**涉及文件**：
- `video-to-audio-backend/src/services/convert/ytdlp.ts`：新增 `downloadViaDirect`、`needsProxyExtract`，B 站链接走两步走分支
- `video-to-audio-backend/Dockerfile`：runner 阶段新增 `wget` 安装

---

### 代理协议选择：http / socks5 / socks5h 的区别

**触发场景**：将代理协议从 `http://` 改为 `socks5://` 后，yt-dlp 报 `[Errno 4] Host unreachable`；改为 `socks5h://` 后偶发超时；最终 `socks5h://` + `--socket-timeout 30` 稳定可用。

**三种协议的本质差异**：

| 协议 | DNS 解析方 | HTTPS 支持 | 适用场景 |
|------|-----------|-----------|---------|
| `http://` | 本地 | 需 CONNECT 隧道，取决于代理支持 | HTTP 网站，或代理支持 CONNECT 的 HTTPS |
| `socks5://` | **本地** DNS 解析后传 IP | ✅ 天然支持 | 代理 ACL 允许裸 IP 访问时 |
| `socks5h://` | **代理服务器** DNS 解析 | ✅ 天然支持 | 代理 ACL 只允许域名、或本地无法解析时 |

**常见错误表现**：
- `http://` → 住宅代理通常不支持 HTTPS CONNECT 隧道，返回 503
- `socks5://` → 本地解析出 IP 后传给代理，若代理 ACL 拒绝裸 IP → `Errno 4 Host unreachable`
- `socks5h://` → 传域名给代理，代理自己解析，ACL 通过 → ✅ 可用

**curl 验证命令**：

```bash
# socks5h（让代理解析 DNS）- 等价 yt-dlp 的 socks5h://
curl -v --socks5-hostname 'ip:port' -U 'user:pass' 'https://www.bilibili.com'
# 成功标志：SOCKS5 request granted. + HTTP/2 200

# socks5（本地 DNS）
curl -v --socks5 'ip:port' -U 'user:pass' 'https://www.bilibili.com'
# 失败标志：Can't complete SOCKS5 connection to ... (2 或 4)
```

**涉及文件**：`video-to-audio-backend/src/services/convert/ytdlp.ts` — `socks5hProxy` 替换逻辑及 `--socket-timeout 30` 参数。

---

### 代理 IP 被目标网站拉黑的判断方法

**触发场景**：代理连接正常建立（`SOCKS5 request granted`），但等待 20 秒无响应，`HTTP_CODE: 000`。这说明代理服务器本身可达，但该出口 IP 已被目标网站（B 站）拉黑，连接建立后直接 RST。

**判断方法**：

```bash
# 区分"代理不通"和"IP 被拉黑"
curl -s --max-time 15 \
  --socks5-hostname 'ip:port' -U 'user:pass' \
  -w 'HTTP_CODE:%{http_code}\n' \
  'https://api.bilibili.com/x/web-interface/nav' -o /dev/null

# HTTP_CODE:200 → 代理 IP 可用
# HTTP_CODE:000（超时）→ 该出口 IP 被 B 站拉黑，需更换代理出口 IP
```

**关键区分**：`SOCKS5 request granted` 只代表代理隧道建立成功，不代表目标网站接受该 IP。连接超时（000）而非立即拒绝（4xx），是 IP 被静默拉黑的典型特征。

---

### wget 下载 CDN 资源返回 403

**触发场景**：`yt-dlp -g` 成功拿到 B 站 CDN 直链后，`wget` 直接下载返回 HTTP 403。

**根本原因**：B 站 CDN 会校验 `User-Agent` 和 `Referer`，裸 wget 默认 UA（`Wget/x.x`）被识别为非浏览器请求，直接拒绝。

**修复**：为 `wget` 补充请求头伪装：

```bash
wget -O outputPath \
  --user-agent 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ...' \
  --header 'Referer: https://www.bilibili.com/' \
  directUrl
```

**涉及文件**：`video-to-audio-backend/src/services/convert/ytdlp.ts` — `downloadViaDirect` 函数的 `wget` 参数。

---

### 双环境部署流程（video-to-audio）

**端口分配**：

| 环境 | 前端端口 | 说明 |
|------|---------|------|
| 测试（dev） | `3091` | 手动触发，供验证用 |
| 生产（prod） | `3090` | 测试通过后手动晋级 |

security 占用了 `80`（HTTP 默认端口），video 与其共存同一服务器，只能用非标准端口。前后端各自独立部署（`--no-deps`），volume 按环境隔离（`vta-db-dev` / `vta-db-prod`），测试数据不会污染生产。

**完整流程**：

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

生产部署不重新执行 `docker build`，用 `docker buildx imagetools create` 对已有 sha 镜像追加语义版本 tag（纯 manifest 操作，不产生新镜像层）。保证测试验证过的镜像和上线的镜像是同一个二进制产物，消除"测试是 A 构建、生产是 B 构建"的风险。

---

## 移动端兼容

### 国产手机浏览器拦截 JS 触发下载，文件格式错误（.vdat）

**触发场景**：转换完成后点击「下载 MP3」，夸克/UC 等国产手机浏览器弹出"请选择操作"，点击「本地缓存」后，下载的文件是 `.vdat` 而非 `.mp3`；且从点击按钮到弹出选择框有半分钟以上的延迟。

**根本原因（两个独立问题叠加）**：

1. **延迟问题**：原下载逻辑用 `fetch` 把整个文件载入内存，再创建 Blob URL 触发 `<a>.click()`。4 分钟 MP3 约 4-8MB，移动网络下全量载入需要较长时间，期间没有任何进度反馈，用户误以为未响应，反复点击。

2. **格式错误问题**：`a.click()` 是 **JS 程序触发**的下载，不是用户直接点击。国产手机浏览器（夸克/UC 等）会将此类下载拦截，交由自己的下载管理器处理。下载管理器无法获取到 `Content-Disposition` 中的文件名，只能从 URL 路径（`/api/file/{uuid}/download`）推断，推断失败后存成 `.vdat`（浏览器内部格式标识）。

**排查过程**：

| 尝试方向 | 结果 | 原因 |
|---------|------|------|
| 检查后端 `Content-Disposition` 头 | 设置正确 | 不是后端问题 |
| 检查 `Content-Type` 是否为 `audio/mpeg` | 设置正确 | 不是 MIME 问题 |
| 定位为"程序触发 vs 用户触发"的区别 | ✅ 找到根因 | 国产浏览器拦截非用户点击的下载 |

**解法：改为 `window.location.href` 直接跳转下载 URL**

```
旧方案：
用户点击按钮 → fetch 全量下载到内存 → 创建 Blob URL → a.click()（程序触发，被拦截）

新方案：
用户点击按钮 → window.location.href = '/api/file/.../download?token=xxx'（用户触发，不被拦截）
```

浏览器接管下载后：
- **即点即开始**，无需等全量载入
- **文件名正确**，`Content-Disposition` 直接生效
- **格式正确**，浏览器从响应头识别类型而非 URL 路径

**相关的鉴权改造**：

`window.location.href` 无法附加自定义请求头，token 必须放在 URL query string 中（`?token=xxx`）。这是业界通用做法（OSS 预签名 URL 同理），安全边界如下：

- 仅限 `/api/file/:fileId/download` 路由启用，新增 `fileDownloadAuthMiddleware` 与标准 `authMiddleware` 隔离
- 不用于任何写操作接口
- Token 有效期 1h，过期自动失效
- HTTPS 环境下 URL 在传输层加密

**涉及文件**：
- `video-to-audio/src/pages/Home/components/ConvertPanel/ResultPanel.tsx`：`handleDownload` 改为 `window.location.href`
- `video-to-audio-backend/src/middleware/auth.ts`：新增 `fileDownloadAuthMiddleware`
- `video-to-audio-backend/src/routes/file/index.ts`：下载路由改用新中间件
