import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

interface PrivateRouteProps {
  children: React.ReactNode;
}

/**
 * 路由守卫：未登录时重定向到 /login
 * isLoading 期间显示空白，避免闪烁跳转
 */
export default function PrivateRoute({ children }: PrivateRouteProps) {
  const { isLoggedIn, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
