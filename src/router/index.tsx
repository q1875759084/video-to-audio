import { createBrowserRouter, Navigate } from 'react-router-dom';
import LoginPage from '@/pages/Login';
import HomePage from '@/pages/Home';
import PrivateRoute from '@/components/PrivateRoute';

const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: (
      <PrivateRoute>
        <HomePage />
      </PrivateRoute>
    ),
  },
  {
    // 其他路径兜底重定向到首页
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);

export default router;
