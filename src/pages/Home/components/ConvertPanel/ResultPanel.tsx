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
 * Token 不出现在 URL / 服务器日志 / 浏览器历史中。
 * Blob URL 由浏览器内存管理，<audio> 直接读取本地内存，无需任何鉴权。
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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);

    fetchAudioBlob(result.fileId)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        // 直接操作 DOM 设置 src，避免经过 React state 产生 src=undefined 的中间态
        // 中间态会导致浏览器触发 error 事件或以错误的初始状态解码音频
        if (audioRef.current) {
          // 先释放旧的 Blob URL
          if (blobUrlRef.current) {
            URL.revokeObjectURL(blobUrlRef.current);
          }
          blobUrlRef.current = url;
          audioRef.current.src = url;
          audioRef.current.load();
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
          setLoadError(true);
        }
      });

    return () => {
      cancelled = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [result.fileId]);

  /**
   * 下载：优先复用播放器已加载到内存的 Blob URL，避免重复请求服务器。
   *
   * 策略：
   * - 若 blobUrlRef 已有值（预览加载完成），直接用 <a download> 触发下载，零网络等待
   * - 若 blobUrlRef 尚未就绪（加载中或加载失败），回退到 window.location.href 请求服务端下载接口
   *
   * 为何回退时用 window.location.href 而非 fetch+Blob：
   *   国产手机浏览器（夸克/UC等）会拦截 JS 程序触发的下载（a.click()），
   *   从 URL 路径推断类型存成 .vdat 等错误格式；
   *   window.location.href 被识别为用户主动触发，Content-Disposition 文件名直接生效。
   */
  const handleDownload = () => {
    const filename = `audio_${result.fileId.slice(0, 8)}.${result.format}`;

    if (blobUrlRef.current) {
      // 已有缓存的 Blob URL：创建临时 <a> 触发下载，无需重新请求
      const a = document.createElement('a');
      a.href = blobUrlRef.current;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    // 回退：Blob 尚未就绪，使用服务端下载接口（token 通过 query string 传递）
    const token = getAccessToken();
    const url = `/api/file/${result.fileId}/download?token=${encodeURIComponent(token ?? '')}&filename=${encodeURIComponent(filename)}`;
    window.location.href = url;
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
            className={styles.player}
          >
            您的浏览器不支持音频播放
          </audio>
        )}
        {loading && !loadError && (
          <p className={styles.loadingText}>音频加载中...</p>
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
