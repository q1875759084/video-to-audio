import { useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { getHistory } from '@/api/history';
import type { HistoryItem as HistoryItemType } from '@/types/history';
import HistoryItemComponent from './HistoryItem';
import styles from './index.module.scss';

export interface HistoryListRef {
  /** 外部（ConvertPanel 转换完成后）调用此方法刷新列表 */
  refresh: () => void;
}

const HistoryList = forwardRef<HistoryListRef>((_, ref) => {
  const [list, setList] = useState<HistoryItemType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getHistory();
      setList(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载历史记录失败';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // 暴露 refresh 方法给父组件
  useImperativeHandle(ref, () => ({
    refresh: fetchHistory,
  }), [fetchHistory]);

  const handleItemDeleted = useCallback((id: number) => {
    setList((prev) => prev.filter((item) => item.id !== id));
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>历史记录</h2>
        {!isLoading && list.length > 0 && (
          <span className={styles.count}>{list.length} 条</span>
        )}
        <button
          className={styles.refreshBtn}
          onClick={fetchHistory}
          disabled={isLoading}
          title="刷新"
        >
          🔄
        </button>
      </div>

      {isLoading && (
        <div className={styles.state}>
          <span className={styles.loadingSpinner}>⏳</span>
          <p>加载中...</p>
        </div>
      )}

      {!isLoading && error && (
        <div className={styles.state}>
          <p className={styles.errorText}>{error}</p>
          <button className={styles.retryBtn} onClick={fetchHistory}>重试</button>
        </div>
      )}

      {!isLoading && !error && list.length === 0 && (
        <div className={styles.state}>
          <span className={styles.emptyIcon}>📭</span>
          <p className={styles.emptyText}>暂无转换记录</p>
        </div>
      )}

      {!isLoading && !error && list.length > 0 && (
        <div className={styles.list}>
          {list.map((item) => (
            <HistoryItemComponent
              key={item.id}
              item={item}
              onDeleted={handleItemDeleted}
            />
          ))}
        </div>
      )}
    </div>
  );
});

HistoryList.displayName = 'HistoryList';

export default HistoryList;
