import styles from './ProgressBar.module.scss';

interface ProgressBarProps {
  percent: number;   // 0-100
  label: string;
}

/** 通用进度条，上传进度和转码进度复用 */
export default function ProgressBar({ percent, label }: ProgressBarProps) {
  const clampedPercent = Math.min(100, Math.max(0, percent));

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.label}>{label}</span>
        <span className={styles.percent}>{clampedPercent}%</span>
      </div>
      <div className={styles.track}>
        <div
          className={styles.bar}
          style={{ width: `${clampedPercent}%` }}
        />
      </div>
    </div>
  );
}
