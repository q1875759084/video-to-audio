import { useEffect, useRef, useState } from 'react';
import type { ConvertResult } from '@/types/convert';
import { getAccessToken } from '@/utils/token';
import styles from './ResultPanel.module.scss';

interface ResultPanelProps {
  result: ConvertResult;
  onReset: () => void;
}

/**
 * 用带 Authorization 头的 fetch 请求音频文件，返回 Blob Object URL。
 * Token 不会出现在 URL / 服务器日志 / 浏览器历史中。
 */
async function fetchAudioBlob(fileId: string): Promise<string> {
  const token = getAccessToken();
  const res = await fetch(`/api/file/${fileId}/preview`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`获取音频失败: ${res.status}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/** 转换完成后展示：在线预览播放器 + 下载按钮 */
export default function ResultPanel({ result, onReset }: ResultPanelProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const blobUrlRef = useRef<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadError(false);
    setBlobUrl(null);

    fetchAudioBlob(result.fileId)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        blobUrlRef.current = url;
        setBlobUrl(url);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });

    return () => {
      cancelled = true;
      // 组件卸载时释放 Blob URL，避免内存泄漏
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [result.fileId]);

  /** 下载：同样用 fetch + Authorization，动态触发 <a> 点击 */
  const handleDownload = async () => {
    try {
      const token = getAccessToken();
      const res = await fetch(`/api/file/${result.fileId}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`下载失败: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audio_${result.fileId.slice(0, 8)}.${result.format}`;
      a.click();
      // 短暂延迟后释放，确保浏览器已触发下载
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      alert('下载失败，请重试');
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.successIcon}>✅</div>
      <p className={styles.title}>转换完成</p>

      <div className={styles.playerWrapper}>
        {loadError ? (
          <p className={styles.errorText}>音频加载失败，请尝试直接下载</p>
        ) : (
          <audio
            ref={audioRef}
            controls
            src={blobUrl ?? undefined}
            className={styles.player}
          >
            您的浏览器不支持音频播放
          </audio>
        )}
      </div>

      <div className={styles.actions}>
        <button className={styles.downloadBtn} onClick={handleDownload}>
          ⬇ 下载 {result.format.toUpperCase()}
        </button>
        <button className={styles.resetBtn} onClick={onReset}>
          再转一个
        </button>
      </div>
    </div>
  );
}
