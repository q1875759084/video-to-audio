import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import router from '@/router';

// 全局样式注入
const GlobalStyle = () => (
  <style>{`
    *, *::before, *::after {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    html, body, #root {
      height: 100%;
      background: #0f172a;
      color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
        'Helvetica Neue', Arial, 'Noto Sans', sans-serif;
      line-height: 1.6;
      font-size: 14px;
    }
    a {
      color: inherit;
    }
    button, input, select, textarea {
      font-family: inherit;
      font-size: inherit;
    }
  `}</style>
);

export default function App() {
  return (
    <AuthProvider>
      <GlobalStyle />
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
