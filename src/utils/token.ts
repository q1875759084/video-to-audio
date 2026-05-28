/**
 * Token 存储工具
 *
 * 安全设计：
 * - AccessToken：内存 + localStorage 双存储
 *   - 内存：优先读取，避免频繁 IO，页面不刷新则持续有效
 *   - localStorage：页面刷新后从此恢复到内存
 * - RefreshToken：仅存 HttpOnly Cookie（后端 Set-Cookie 写入，前端无法读取，防 XSS）
 */

const ACCESS_TOKEN_KEY = 'vta_access_token';

// 内存缓存，避免频繁读 localStorage
let memoryToken: string | null = null;

/** 登录成功 / Token 刷新成功时调用 */
export function setAccessToken(token: string): void {
  memoryToken = token;
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

/** 获取 AccessToken（优先内存，回退 localStorage） */
export function getAccessToken(): string | null {
  if (memoryToken) return memoryToken;
  const stored = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (stored) memoryToken = stored; // 恢复到内存
  return stored;
}

/** 退出登录 / 刷新失败时调用 */
export function clearToken(): void {
  memoryToken = null;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  // RefreshToken 的 Cookie 由后端 /api/user/logout 接口清除
}

/** 是否存在有效 AccessToken（路由守卫 / 初始化判断用） */
export function hasValidToken(): boolean {
  return !!getAccessToken();
}
