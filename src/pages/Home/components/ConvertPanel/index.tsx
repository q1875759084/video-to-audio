import { useReducer, useCallback, useRef } from 'react';
import { submitUrlConvert } from '@/api/convert';
import { useSSE } from '@/hooks/useSSE';
import type {
  ConvertState,
  ConvertAction,
  ConvertMode,
  OutputFormat,
} from '@/types/convert';
import UrlInput from './UrlInput';
import FileUpload from './FileUpload';
import ProgressBar from './ProgressBar';
import ResultPanel from './ResultPanel';
import styles from './index.module.scss';

// ─── 状态机 ──────────────────────────────────────────────────────────────────
const initialState: ConvertState = {
  status: 'idle',
  mode: 'url',
  uploadProgress: 0,
  convertProgress: 0,
  convertStage: null,
  taskId: null,
  result: null,
  errorMessage: null,
};

function convertReducer(state: ConvertState, action: ConvertAction): ConvertState {
  switch (action.type) {
    case 'SET_MODE':
      return { ...initialState, mode: action.payload };
    case 'START_UPLOAD':
      return { ...state, status: 'uploading', uploadProgress: 0, errorMessage: null };
    case 'SET_UPLOAD_PROGRESS':
      return { ...state, uploadProgress: action.payload };
    case 'START_SUBMITTING':
      return { ...state, status: 'submitting', errorMessage: null };
    case 'START_CONVERTING':
      return { ...state, status: 'converting', taskId: action.payload.taskId };
    case 'SET_CONVERT_PROGRESS':
      return {
        ...state,
        convertProgress: action.payload.percent,
        convertStage: action.payload.stage,
      };
    case 'DONE':
      return { ...state, status: 'done', result: action.payload, convertProgress: 100 };
    case 'ERROR':
      return { ...state, status: 'error', errorMessage: action.payload };
    case 'RESET':
      return { ...initialState, mode: state.mode };
    default:
      return state;
  }
}

// ─── 组件 ────────────────────────────────────────────────────────────────────
interface ConvertPanelProps {
  /** 转换完成后通知父组件刷新历史记录 */
  onConvertDone?: () => void;
}

export default function ConvertPanel({ onConvertDone }: ConvertPanelProps) {
  const [state, dispatch] = useReducer(convertReducer, initialState);

  // 用 ref 保存当前任务的 format，SSE done 时读取（避免闭包过期）
  const currentFormatRef = useRef<OutputFormat>('mp3');

  const { connect: connectSSE } = useSSE({
    onProgress: (data) => {
      dispatch({ type: 'SET_CONVERT_PROGRESS', payload: data });
    },
    onDone: (data) => {
      dispatch({
        type: 'DONE',
        payload: { fileId: data.fileId, format: currentFormatRef.current },
      });
      onConvertDone?.();
    },
    onError: (data) => {
      dispatch({ type: 'ERROR', payload: data.message });
    },
  });

  /** 拿到 taskId 后建立 SSE 连接，开始监听转码进度 */
  const startConvertProgress = useCallback((taskId: string, format: OutputFormat) => {
    currentFormatRef.current = format;
    dispatch({ type: 'START_CONVERTING', payload: { taskId } });
    connectSSE(taskId);
  }, [connectSSE]);

  /** URL 模式：提交链接 */
  const handleUrlSubmit = useCallback(async (url: string, format: OutputFormat) => {
    dispatch({ type: 'START_SUBMITTING' });
    try {
      const { taskId } = await submitUrlConvert({ url, format });
      startConvertProgress(taskId, format);
    } catch (err) {
      const message = err instanceof Error ? err.message : '提交失败，请重试';
      dispatch({ type: 'ERROR', payload: message });
    }
  }, [startConvertProgress]);

  /** 文件模式：分片上传完成，拿到 taskId + format */
  const handleFileTaskCreated = useCallback((taskId: string, format: OutputFormat) => {
    startConvertProgress(taskId, format);
  }, [startConvertProgress]);

  const isLoading = ['uploading', 'submitting', 'converting'].includes(state.status);

  const getProgressLabel = (): string => {
    if (state.status === 'submitting') return '提交中...';
    if (state.status === 'converting') {
      return state.convertStage === 'downloading' ? '下载视频中...' : '音频转码中...';
    }
    return '';
  };

  const getProgressPercent = (): number => {
    if (state.status === 'submitting') return 5;
    if (state.status === 'converting') return Math.max(5, state.convertProgress);
    return 0;
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.title}>音频提取</h2>

        {/* 模式切换 Tab：转换进行中禁用切换 */}
        <div className={styles.tabs}>
          {(['url', 'file'] as ConvertMode[]).map((mode) => (
            <button
              key={mode}
              className={`${styles.tab} ${state.mode === mode ? styles.activeTab : ''}`}
              onClick={() => dispatch({ type: 'SET_MODE', payload: mode })}
              disabled={isLoading}
            >
              {mode === 'url' ? '🔗 粘贴链接' : '📁 上传文件'}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.body}>
        {/* 转换完成：展示结果 */}
        {state.status === 'done' && state.result && (
          <ResultPanel
            result={state.result}
            onReset={() => dispatch({ type: 'RESET' })}
          />
        )}

        {/* 错误状态 */}
        {state.status === 'error' && (
          <div className={styles.errorBox}>
            <p className={styles.errorText}>❌ {state.errorMessage}</p>
            <button
              className={styles.retryBtn}
              onClick={() => dispatch({ type: 'RESET' })}
            >
              重试
            </button>
          </div>
        )}

        {/* 进行中：进度条 */}
        {(state.status === 'submitting' || state.status === 'converting') && (
          <div className={styles.progressWrapper}>
            <ProgressBar
              percent={getProgressPercent()}
              label={getProgressLabel()}
            />
          </div>
        )}

        {/* 输入区（idle / uploading 时显示） */}
        {(state.status === 'idle' || state.status === 'uploading') && (
          <>
            {state.mode === 'url' ? (
              <UrlInput isLoading={isLoading} onSubmit={handleUrlSubmit} />
            ) : (
              <FileUpload
                onTaskCreated={handleFileTaskCreated}
                onError={(msg) => dispatch({ type: 'ERROR', payload: msg })}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
