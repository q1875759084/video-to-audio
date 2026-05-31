import { useState } from 'react';
import type { OutputFormat, TimeSegment } from '@/types/convert';
import styles from './UrlInput.module.scss';

const FORMAT_OPTIONS: { value: OutputFormat; label: string }[] = [
  { value: 'mp3', label: 'MP3' },
  { value: 'aac', label: 'AAC' },
  { value: 'wav', label: 'WAV' },
];

interface UrlInputProps {
  isLoading: boolean;
  onSubmit: (url: string, format: OutputFormat, segments?: TimeSegment[]) => void;
}

type TrimMode = 'all' | 'custom';

interface SegmentDraft {
  start: string;
  end: string;
}

/** 校验时间格式：HH:MM:SS 或 MM:SS */
function isValidTime(val: string): boolean {
  return /^\d{1,2}:\d{2}:\d{2}$/.test(val.trim()) || /^\d{1,2}:\d{2}$/.test(val.trim());
}

export default function UrlInput({ isLoading, onSubmit }: UrlInputProps) {
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState<OutputFormat>('mp3');
  const [trimMode, setTrimMode] = useState<TrimMode>('all');
  const [segments, setSegments] = useState<SegmentDraft[]>([{ start: '', end: '' }]);

  const handleSubmit = () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;

    if (trimMode === 'all') {
      onSubmit(trimmedUrl, format);
      return;
    }

    const filled: TimeSegment[] = segments
      .filter((seg) => isValidTime(seg.start) && isValidTime(seg.end))
      .map((seg) => ({ start: seg.start.trim(), end: seg.end.trim() }));

    if (filled.length === 0) return;
    onSubmit(trimmedUrl, format, filled);
  };

  const handleAddSegment = () => {
    setSegments((prev) => [...prev, { start: '', end: '' }]);
  };

  const handleRemoveSegment = (index: number) => {
    setSegments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSegmentField = (index: number, field: 'start' | 'end', value: string) => {
    setSegments((prev) =>
      prev.map((seg, i) => (i === index ? { ...seg, [field]: value } : seg)),
    );
  };

  const hasValidSegment =
    trimMode === 'all' ||
    segments.some((seg) => isValidTime(seg.start) && isValidTime(seg.end));
  const canSubmit = !isLoading && !!url.trim() && hasValidSegment;

  return (
    <div className={styles.container}>
      <div className={styles.inputRow}>
        <input
          type="text"
          className={styles.urlInput}
          placeholder="粘贴视频链接或分享文本（支持 B站、YouTube 等平台及直链）"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && canSubmit && handleSubmit()}
          disabled={isLoading}
        />
      </div>

      {/* 截取范围行 */}
      <div className={styles.optionRow}>
        <span className={styles.optionLabel}>截取范围</span>
        <div className={styles.tagGroup}>
          {(['all', 'custom'] as TrimMode[]).map((mode) => (
            <button
              key={mode}
              className={`${styles.formatBtn} ${trimMode === mode ? styles.active : ''}`}
              onClick={() => setTrimMode(mode)}
              disabled={isLoading}
            >
              {mode === 'all' ? '全部' : '自定义'}
            </button>
          ))}
        </div>
      </div>

      {/* 自定义片段列表 */}
      {trimMode === 'custom' && (
        <div className={styles.segmentList}>
          {segments.map((seg, index) => (
            <div key={index} className={styles.segmentRow}>
              <span className={styles.segmentLabel}>片段 {index + 1}</span>
              <div className={styles.timeRange}>
                <input
                  className={`${styles.timeInput} ${seg.start && !isValidTime(seg.start) ? styles.timeInputError : ''}`}
                  type="text"
                  value={seg.start}
                  onChange={(e) => handleSegmentField(index, 'start', e.target.value)}
                  placeholder="00:00:00"
                  disabled={isLoading}
                />
                <span className={styles.timeSep}>→</span>
                <input
                  className={`${styles.timeInput} ${seg.end && !isValidTime(seg.end) ? styles.timeInputError : ''}`}
                  type="text"
                  value={seg.end}
                  onChange={(e) => handleSegmentField(index, 'end', e.target.value)}
                  placeholder="00:01:30"
                  disabled={isLoading}
                />
              </div>
              {segments.length > 1 && (
                <button
                  className={styles.removeBtn}
                  onClick={() => handleRemoveSegment(index)}
                  disabled={isLoading}
                  aria-label="删除此片段"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <p className={styles.segmentHint}>格式：时:分:秒，如 00:01:30 表示第 1 分 30 秒</p>
          <button
            className={styles.addSegmentBtn}
            onClick={handleAddSegment}
            disabled={isLoading}
          >
            + 添加片段
          </button>
        </div>
      )}

      {/* 底部：输出格式 + 提交按钮 */}
      <div className={styles.footer}>
        <div className={styles.formatGroup}>
          <span className={styles.formatLabel}>输出格式</span>
          {FORMAT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`${styles.formatBtn} ${format === opt.value ? styles.active : ''}`}
              onClick={() => setFormat(opt.value)}
              disabled={isLoading}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <button
          className={styles.submitBtn}
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {isLoading ? '处理中...' : '开始转换'}
        </button>
      </div>
    </div>
  );
}
