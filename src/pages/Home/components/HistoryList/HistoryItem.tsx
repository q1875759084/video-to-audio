import { useState } from 'react';
import type { HistoryItem as HistoryItemType } from '@/types/history';
import { deleteHistory } from '@/api/history';
import { getToken } from '@/utils/token';
import styles from './HistoryItem.module.scss';

interface HistoryItemProps {
  item: HistoryItemType;
  onDeleted: (id: number) => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function HistoryItem({ item, onDeleted }: HistoryItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const previewUrl = `/api/file/${item.fileId}/preview`;
  // 下载接口需要携带 token（通过 URL 参数，a 标签无法设置 header）
  const token = getToken();
  const downloadUrl = `/api/file/${item.fileId}/download${token ? `?token=${encodeURIComponent(token)}` : ''}`;

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteHistory(item.id);
      onDeleted(item.id);
    } catch {
      // 删除失败静默处理，不影响列表展示
    } finally {
      setIsDeleting(false);
      setShowConfirm(false);
    }
  };

  return (
    <div className={styles.item}>
      <div className={styles.main}>
        {/* 文件信息 */}
        <div className={styles.info}>
          <span className={styles.format}>{item.format.toUpperCase()}</span>
          <span className={styles.name} title={item.originalName}>
            {item.originalName}
          </span>
        </div>

        {/* 元信息 */}
        <div className={styles.meta}>
          {item.duration > 0 && (
            <span className={styles.metaItem}>🕐 {formatDuration(item.duration)}</span>
          )}
          {item.fileSize > 0 && (
            <span className={styles.metaItem}>📦 {formatFileSize(item.fileSize)}</span>
          )}
          <span className={styles.metaItem}>📅 {formatDate(item.createdAt)}</span>
        </div>

        {/* 操作按钮 */}
        <div className={styles.actions}>
          <button
            className={styles.actionBtn}
            onClick={() => setIsExpanded((v) => !v)}
          >
            {isExpanded ? '收起' : '▶ 预览'}
          </button>
          <a
            href={downloadUrl}
            className={styles.actionBtn}
            download
          >
            ⬇ 下载
          </a>
          {showConfirm ? (
            <>
              <span className={styles.confirmText}>确认删除？</span>
              <button
                className={`${styles.actionBtn} ${styles.dangerBtn}`}
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? '删除中' : '确认'}
              </button>
              <button
                className={styles.actionBtn}
                onClick={() => setShowConfirm(false)}
              >
                取消
              </button>
            </>
          ) : (
            <button
              className={`${styles.actionBtn} ${styles.deleteBtn}`}
              onClick={() => setShowConfirm(true)}
            >
              🗑 删除
            </button>
          )}
        </div>
      </div>

      {/* 内联预览播放器（展开时显示）*/}
      {isExpanded && (
        <div className={styles.player}>
          <audio controls src={previewUrl} className={styles.audio}>
            您的浏览器不支持音频播放
          </audio>
        </div>
      )}
    </div>
  );
}
