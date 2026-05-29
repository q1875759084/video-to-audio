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

**触发场景**：yt-dlp 从腾讯云服务器（上海）直接请求 B 站链接，返回 HTTP 412 或 `<title>验证码_哔哩哔哩</title>`，下载失败。

**根本原因**：B 站对已知数据中心 IP 段有渐进式风控，即使是国内 IP，只要识别为云主机即触发人机验证。`window._riskdata_` 出现在响应 HTML 中是铁证。此时加 UA、Cookie、Referer 均无效，因为风控的核心是 **IP 类型**，而非请求头。

**排查过程**：

| 尝试方案 | 结果 | 原因 |
|---------|------|------|
| 加 `--user-agent` / `--add-header Referer` | ❌ | 风控不看请求头 |
| `--geo-bypass` | ❌ | 无效，B 站不看 GeoIP |
| `--cookies-from-browser` | ❌ | Cookie 不能改变 IP 类型 |
| `--extractor-args bilibili:player_client=android` | ❌ | yt-dlp 将安卓 UA 解析出 `m.bilibili.com` URL，但 generic extractor 不支持移动端页面 |
| 升级 yt-dlp 到 nightly | ❌ | 同上，安卓模拟方向有限制 |

**最终解法**：引入国内运营商原生 IP 代理（快代理 独享代理 纯生版），`--proxy` 参数让 yt-dlp 全程走住宅 IP，完全绕过数据中心 IP 标记。

**代理选型原则**：
- ✅ 国内住宅/家庭宽带 IP（"纯生版"、"原生 IP"）
- ❌ 海外 IP（B 站对海外风控更严）
- ❌ 免费代理（IP 段早已进黑名单）
- ❌ 普通隧道代理（仍为数据中心 IP）

---

### 代理带宽瓶颈：独享代理实测仅 4 KB/s

**触发场景**：引入代理后，7 分钟的 B 站视频，3.5 分钟仅下载 5%，实测代理带宽约 4 KB/s（约 0.03 Mbps）。

**根本原因**：「独享代理 纯生版」的产品定位是 **IP 纯净度**，不是下载速度。带宽极低是该产品的固有特性，不是配置问题。

**验证方式**：

```bash
# 通过代理下载测速
curl -o /dev/null -s -w '%{speed_download} B/s\n' \
  --proxy 'http://user:pass@ip:port' \
  'http://httpbin.org/bytes/2000000'
# 实测结果：4103 B/s ≈ 4 KB/s
```

**解法：两步走，代理只用于认证，数据直连下载**

```
旧方案（全程走代理，极慢）：
B站链接 → yt-dlp（--proxy → 4KB/s 下载数据）→ 2-3 小时

新方案（代理仅获取直链，直连下载数据）：
B站链接 → yt-dlp -g（--proxy → 获取 CDN 直链，<1s）
         → wget（无代理，直连腾讯云 5-10 Mbps）→ 30-60 秒
```

**核心原理**：B 站 CDN 直链（`bilivideo.com`）对来源 IP 没有限制，签名参数只验证有效期（约 10 分钟），不绑定 IP。代理只需要参与 B 站 API 认证阶段（流量极小），实际视频数据走服务器直连满速下载。

**实现要点**：
- `yt-dlp -g` + `--proxy`：通过代理调用 B 站 API，返回带签名的 CDN 直链，不下载任何数据
- `wget -O outputPath directUrl`：直连下载，不携带代理
- B 站 bestaudio 通常为 `m4a` 格式，固定输出为 `source.m4a`，ffmpeg 可直接处理
- 直链有效期约 10 分钟，获取后须立即下载，不可缓存

**涉及文件**：
- `video-to-audio-backend/src/services/convert/ytdlp.ts`：新增 `downloadViaDirect`、`needsProxyExtract`，B 站链接走两步走分支
- `video-to-audio-backend/Dockerfile`：runner 阶段新增 `wget` 安装

---

### 代理 IP 动态化：通过 API 获取，无需手动更新

**背景**：快代理独享代理（动态型）每天会自动更换 IP，硬编码 IP 地址会在次日凌晨失效，需要每天手动去 GitHub 改 Secret。

**解法**：每次调用 yt-dlp 前，先请求快代理 `getkpsbyid` API 获取当前有效 IP，拼成完整代理地址再传给 yt-dlp。

```
快代理 API → { ip: "58.19.x.x", port: "10803" }
→ 拼成 http://user:pass@58.19.x.x:10803
→ yt-dlp --proxy http://user:pass@58.19.x.x:10803
```

**鉴权方式**：快代理支持「密钥明文验证」，`signature` 字段直接填 SecretKey，无需额外 token。

**凭证管理**：SecretId / SecretKey / 代理用户名密码通过环境变量注入（`KDL_SECRET_ID`、`KDL_SIGNATURE`、`KDL_PROXY_USER`、`KDL_PROXY_PASS`），代码内保留 `??` 默认值作为回退，方便本地直接运行。

**涉及文件**：`video-to-audio-backend/src/services/convert/ytdlp.ts` 中的 `getKdlProxy()` 函数。

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
