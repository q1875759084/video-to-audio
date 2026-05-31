import { useState } from 'react';
import { TimePicker } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
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

const TIME_FORMAT = 'HH:mm:ss';

/** dayjs 对象转 HH:MM:SS 字符串 */
function dayjsToTimeStr(d: Dayjs): string {
  return d.format(TIME_FORMAT);
}

export default function UrlInput({ isLoading, onSubmit }: UrlInputProps) {
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState<OutputFormat>('mp3');
  const [trimMode, setTrimMode] = useState<TrimMode>('all');
  // 每个片段用 [start, end] 的 Dayjs 对存；null 表示未选
  const [segments, setSegments] = useState<([Dayjs, Dayjs] | null)[]>([null]);

  const handleSubmit = () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;

    if (trimMode === 'all') {
      onSubmit(trimmedUrl, format);
      return;
    }

    // 自定义模式：把已填写的片段转为字符串格式（过滤掉未填写的）
    const filled = segments
      .filter((seg): seg is [Dayjs, Dayjs] => seg !== null)
      .map((seg) => ({ start: dayjsToTimeStr(seg[0]), end: dayjsToTimeStr(seg[1]) }));

    if (filled.length === 0) return;
    onSubmit(trimmedUrl, format, filled);
  };

  const handleAddSegment = () => {
    setSegments((prev) => [...prev, null]);
  };

  const handleRemoveSegment = (index: number) => {
    setSegments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSegmentChange = (index: number, value: [Dayjs, Dayjs] | null) => {
    setSegments((prev) => prev.map((seg, i) => (i === index ? value : seg)));
  };

  // 自定义模式下至少有一个片段已填写才允许提交
  const hasValidSegment = trimMode === 'all' || segments.some((seg) => seg !== null);
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

      {/* 自定义片段列表（trimMode === 'custom' 时展开） */}
      {trimMode === 'custom' && (
        <div className={styles.segmentList}>
          {segments.map((seg, index) => (
            <div key={index} className={styles.segmentRow}>
              <span className={styles.segmentLabel}>片段 {index + 1}</span>
              <TimePicker.RangePicker
                className={styles.rangePicker}
                value={seg}
                onChange={(val) => handleSegmentChange(index, val as [Dayjs, Dayjs] | null)}
                disabled={isLoading}
                format={TIME_FORMAT}
                showSecond
                needConfirm={false}
                placeholder={['开始 00:00:00', '结束 00:00:00']}
                order={false}
              />
              {/* 至少保留一个片段，只有多于一个时才显示删除按钮 */}
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
