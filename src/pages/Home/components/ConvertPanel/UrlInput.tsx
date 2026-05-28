import { useState } from 'react';
import type { OutputFormat } from '@/types/convert';
import styles from './UrlInput.module.scss';

const FORMAT_OPTIONS: { value: OutputFormat; label: string }[] = [
  { value: 'mp3', label: 'MP3' },
  { value: 'aac', label: 'AAC' },
  { value: 'wav', label: 'WAV' },
];

interface UrlInputProps {
  isLoading: boolean;
  onSubmit: (url: string, format: OutputFormat) => void;
}

export default function UrlInput({ isLoading, onSubmit }: UrlInputProps) {
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState<OutputFormat>('mp3');

  const handleSubmit = () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;
    onSubmit(trimmedUrl, format);
  };

  return (
    <div className={styles.container}>
      <div className={styles.inputRow}>
        <input
          type="text"
          className={styles.urlInput}
          placeholder="粘贴视频链接（支持 B站、YouTube 等平台及直链）"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          disabled={isLoading}
        />
      </div>

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
          disabled={isLoading || !url.trim()}
        >
          {isLoading ? '处理中...' : '开始转换'}
        </button>
      </div>
    </div>
  );
}
