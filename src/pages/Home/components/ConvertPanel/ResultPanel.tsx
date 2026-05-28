import { useRef } from 'react';
import type { ConvertResult } from '@/types/convert';
import styles from './ResultPanel.module.scss';

interface ResultPanelProps {
  result: ConvertResult;
  onReset: () => void;
}

/** 转换完成后展示：在线预览播放器 + 下载按钮 */
export default function ResultPanel({ result, onReset }: ResultPanelProps) {
  const audioRef = useRef<HTMLAudioElement>(null);

  const previewUrl = `/api/file/${result.fileId}/preview`;
  const downloadUrl = `/api/file/${result.fileId}/download`;

  return (
    <div className={styles.container}>
      <div className={styles.successIcon}>✅</div>
      <p className={styles.title}>转换完成</p>

      {/* 在线预览：HTML5 audio 播放器，Range 请求由后端支持 */}
      <div className={styles.playerWrapper}>
        <audio
          ref={audioRef}
          controls
          src={previewUrl}
          className={styles.player}
        >
          您的浏览器不支持音频播放
        </audio>
      </div>

      <div className={styles.actions}>
        <a
          href={downloadUrl}
          className={styles.downloadBtn}
          download
        >
          ⬇ 下载 {result.format.toUpperCase()}
        </a>
        <button className={styles.resetBtn} onClick={onReset}>
          再转一个
        </button>
      </div>
    </div>
  );
}
