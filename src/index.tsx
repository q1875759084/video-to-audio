import { createRoot } from 'react-dom/client';
import App from './App';

const container = document.getElementById('root');
if (!container) {
  throw new Error('[index.tsx] 挂载失败：未找到 #root 元素，请检查 public/index.html');
}

createRoot(container).render(<App />);
