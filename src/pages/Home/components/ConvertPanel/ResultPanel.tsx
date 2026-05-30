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
   * 下载：直接让浏览器跳转到下载 URL，token 通过 query string 传递。
   *
   * 为何不用 fetch + Blob URL：
   * 1. 需要把整个文件加载进内存才能触发下载，移动端等待时间长且无进度反馈
   * 2. 通过 JS 程序触发（a.click()）而非用户直接点击，国产手机浏览器（夸克/UC等）
   *    会拦截并走自己的下载管理器，无法识别 Content-Disposition 中的文件名，
   *    从 URL 路径推断类型，存成 .vdat 等错误格式
   *
   * 用 window.location.href 跳转：
   * - 浏览器识别为用户主动触发的下载，不走拦截逻辑
   * - Content-Disposition 中的文件名直接生效
   * - 无需等待全部加载，浏览器边下边存
   */
  const handleDownload = () => {
    const token = getAccessToken();
    const filename = `audio_${result.fileId.slice(0, 8)}.${result.format}`;
    // 带文件名后缀的 URL，让浏览器从路径也能推断文件类型（双重保险）
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
