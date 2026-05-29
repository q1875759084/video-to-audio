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
