import { useRef, useState, useCallback } from 'react';
import type { OutputFormat } from '@/types/convert';
import { useChunkUpload } from '@/hooks/useChunkUpload';
import ProgressBar from './ProgressBar';
import styles from './FileUpload.module.scss';

const FORMAT_OPTIONS: { value: OutputFormat; label: string }[] = [
  { value: 'mp3', label: 'MP3' },
  { value: 'aac', label: 'AAC' },
  { value: 'wav', label: 'WAV' },
];

// 支持的视频/音频格式
const ACCEPT = 'video/*,audio/*,.mp4,.mov,.avi,.mkv,.webm,.flv,.wmv,.m4v,.mp3,.m4a,.flac';

interface FileUploadProps {
  onTaskCreated: (taskId: string, format: OutputFormat) => void;
  onError: (message: string) => void;
}

export default function FileUpload({ onTaskCreated, onError }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [format, setFormat] = useState<OutputFormat>('mp3');
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const { upload, isUploading } = useChunkUpload({
    onProgress: setUploadProgress,
    onComplete: (taskId) => onTaskCreated(taskId, format),
    onError,
  });

  const handleFileSelect = useCallback((file: File) => {
    setSelectedFile(file);
    setUploadProgress(0);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleSubmit = useCallback(() => {
    if (!selectedFile || isUploading) return;
    upload(selectedFile, format);
  }, [selectedFile, format, isUploading, upload]);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className={styles.container}>
      {/* 拖拽/点击上传区域 */}
      <div
        className={`${styles.dropZone} ${isDragOver ? styles.dragOver : ''} ${selectedFile ? styles.hasFile : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !isUploading && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          onChange={handleInputChange}
          className={styles.hiddenInput}
          disabled={isUploading}
        />

        {selectedFile ? (
          <div className={styles.fileInfo}>
            <span className={styles.fileIcon}>🎬</span>
            <span className={styles.fileName}>{selectedFile.name}</span>
            <span className={styles.fileSize}>{formatFileSize(selectedFile.size)}</span>
          </div>
        ) : (
          <div className={styles.placeholder}>
            <span className={styles.uploadIcon}>📁</span>
            <p className={styles.primaryText}>拖拽视频文件到此处，或点击选择</p>
            <p className={styles.secondaryText}>支持 MP4、MOV、AVI、MKV、WebM 等格式</p>
          </div>
        )}
      </div>

      {/* 上传进度条（仅上传中显示）*/}
      {isUploading && (
        <ProgressBar
          percent={uploadProgress}
          label={uploadProgress < 95 ? '上传中...' : '准备转码...'}
        />
      )}

      {/* 格式选择 + 提交 */}
      <div className={styles.footer}>
        <div className={styles.formatGroup}>
          <span className={styles.formatLabel}>输出格式</span>
          {FORMAT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`${styles.formatBtn} ${format === opt.value ? styles.active : ''}`}
              onClick={() => setFormat(opt.value)}
              disabled={isUploading}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <button
          className={styles.submitBtn}
          onClick={handleSubmit}
          disabled={!selectedFile || isUploading}
        >
          {isUploading ? '上传中...' : '开始上传'}
        </button>
      </div>
    </div>
  );
}
