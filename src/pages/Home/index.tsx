import { useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import ConvertPanel from './components/ConvertPanel';
import HistoryList, { type HistoryListRef } from './components/HistoryList';
import styles from './index.module.scss';

export default function HomePage() {
  const { userInfo, logout } = useAuth();
  const navigate = useNavigate();
  const historyListRef = useRef<HistoryListRef>(null);

  const handleLogout = useCallback(async () => {
    await logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  const handleConvertDone = useCallback(() => {
    // 转换完成后刷新历史记录列表
    historyListRef.current?.refresh();
  }, []);

  return (
    <div className={styles.page}>
      {/* 顶部导航栏 */}
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.logo}>🎵</span>
          <span className={styles.brandName}>音频提取工具</span>
        </div>
        <div className={styles.user}>
          <span className={styles.username}>{userInfo?.nickname || userInfo?.username}</span>
          <button className={styles.logoutBtn} onClick={handleLogout}>
            退出
          </button>
        </div>
      </header>

      {/* 主内容区：上下两栏 */}
      <main className={styles.main}>
        <ConvertPanel onConvertDone={handleConvertDone} />
        <HistoryList ref={historyListRef} />
      </main>
    </div>
  );
}
