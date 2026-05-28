import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { getToken, setToken, clearToken } from '@/utils/token';
import { loginApi, logoutApi, getProfileApi } from '@/api/user';
import type { UserInfo, LoginRequest } from '@/types/user';

interface AuthContextValue {
  userInfo: UserInfo | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  login: (data: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  userInfo: null,
  isLoggedIn: false,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 应用初始化：有 token 则尝试获取用户信息
  useEffect(() => {
    const init = async () => {
      const token = getToken();
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        const profile = await getProfileApi();
        setUserInfo(profile);
      } catch {
        // Token 过期或无效，清除后由路由守卫跳转登录
        clearToken();
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  const login = useCallback(async (data: LoginRequest) => {
    const result = await loginApi(data);
    setToken(result.accessToken);
    setUserInfo(result.userInfo);
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutApi();
    } catch {
      // 退出接口失败不影响本地状态清除
    }
    clearToken();
    setUserInfo(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        userInfo,
        isLoggedIn: !!userInfo,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
