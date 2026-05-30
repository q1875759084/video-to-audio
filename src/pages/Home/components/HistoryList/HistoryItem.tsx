import { useEffect, useRef, useState } from 'react';
import type { HistoryItem as HistoryItemType } from '@/types/history';
import { deleteHistory } from '@/api/history';
import { getAccessToken } from '@/utils/token';
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

/**
 * 内联预览播放器：展开时用 fetch + Authorization 拉取音频，生成 Blob URL 给 <audio>。
 * Token 不会出现在 URL / 服务器日志 / 浏览器历史中。
 * 收起（组件卸载）时自动释放 Blob URL，避免内存泄漏。
 */
function InlinePlayer({ fileId }: { fileId: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    fetch(`/api/file/${fileId}/preview`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        setBlobUrl(url);
      })
      .catch(() => setError(true));

    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [fileId]);

  if (error) return <p className={styles.errorText}>音频加载失败</p>;
  return (
    <audio controls src={blobUrl ?? undefined} className={styles.audio}>
      您的浏览器不支持音频播放
    </audio>
  );
}

export default function HistoryItem({ item, onDeleted }: HistoryItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [downloading, setDownloading] = useState(false);

  /** 下载：fetch + Authorization 头，动态触发 <a> 点击 */
  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const token = getAccessToken();
      const res = await fetch(`/api/file/${item.fileId}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`下载失败: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audio_${item.fileId.slice(0, 8)}.${item.format}`;
      a.click();
      // 短暂延迟后释放，确保浏览器已触发下载
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      alert('下载失败，请重试');
    } finally {
      setDownloading(false);
    }
  };

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
        <button className={styles.actionBtn} onClick={handleDownload} disabled={downloading}>
          {downloading ? '下载中...' : '⬇ 下载'}
        </button>
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

      {/* 内联预览播放器（展开时挂载，收起时卸载并释放 Blob URL）*/}
      {isExpanded && (
        <div className={styles.player}>
          <InlinePlayer fileId={item.fileId} />
        </div>
      )}
    </div>
  );
}
