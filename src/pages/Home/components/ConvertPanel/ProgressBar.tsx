import styles from './ProgressBar.module.scss';

interface ProgressBarProps {
  percent: number;   // 0-100
  label: string;
  /** true 时显示来回滚动的不确定进度动画（排队等待场景） */
  indeterminate?: boolean;
}

/** 通用进度条，支持确定进度和不确定进度（排队等待）两种模式 */
export default function ProgressBar({ percent, label, indeterminate = false }: ProgressBarProps) {
  const clampedPercent = Math.min(100, Math.max(0, percent));

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.label}>{label}</span>
        {/* 不确定模式下不显示百分比数字，避免一直显示 0% 造成误解 */}
        {!indeterminate && (
          <span className={styles.percent}>{clampedPercent}%</span>
        )}
      </div>
      <div className={styles.track}>
        {indeterminate ? (
          <div className={styles.barIndeterminate} />
        ) : (
          <div
            className={styles.bar}
            style={{ width: `${clampedPercent}%` }}
          />
        )}
      </div>
    </div>
  );
}
