import type { ConvertResult } from '@/types/convert';
import styles from './ResultPanel.module.scss';

interface ResultPanelProps {
  result: ConvertResult;
  onReset: () => void;
}

/** 转换完成后展示：在线预览播放器 + 下载按钮 */
export default function ResultPanel({ result, onReset }: ResultPanelProps) {
  const previewUrl = `/api/file/${result.fileId}/preview`;
  const filename = `audio_${result.fileId.slice(0, 8)}.${result.format}`;
  const downloadUrl = `/api/file/${result.fileId}/download?filename=${encodeURIComponent(filename)}`;

  return (
    <div className={styles.container}>
      <div className={styles.successIcon}>✅</div>
      <p className={styles.title}>转换完成</p>

      <div className={styles.playerWrapper}>
        {/* fileId 是 UUID，知道链接即可访问（capability URL）。
            <audio> 直接设 src，浏览器流式播放，支持 Range 拖进度条，无需 fetch+Blob。 */}
        <audio
          src={previewUrl}
          controls
          className={styles.player}
        >
          您的浏览器不支持音频播放
        </audio>
      </div>

      <div className={styles.actions}>
        {/* <a download> 是标准的浏览器原生下载，Content-Disposition 文件名直接生效 */}
        <a
          className={styles.downloadBtn}
          href={downloadUrl}
          download={filename}
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
