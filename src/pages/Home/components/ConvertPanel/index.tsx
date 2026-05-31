import { useReducer, useCallback, useRef } from 'react';
import { submitUrlConvert, TaskLimitError } from '@/api/convert';
import { useSSE } from '@/hooks/useSSE';
import type {
  ConvertState,
  ConvertAction,
  ConvertMode,
  OutputFormat,
  ActiveTaskSummary,
  TimeSegment,
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
  activeTasks: null,
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
    case 'START_QUEUED':
      return { ...state, status: 'queued', taskId: action.payload.taskId };
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
    case 'BLOCKED':
      // 并发超限：展示当前占用配额的任务，提供恢复监听入口
      return { ...state, status: 'blocked', activeTasks: action.payload, errorMessage: null };
    case 'RESET':
      return { ...initialState, mode: state.mode };
    default:
      return state;
  }
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

/** 将 source 字符串截断展示（URL 只保留域名+路径尾部，文件名保留原名） */
function formatSource(task: ActiveTaskSummary): string {
  if (task.type === 'url') {
    try {
      const url = new URL(task.source);
      const pathname = url.pathname.split('/').filter(Boolean).slice(-2).join('/');
      return `${url.hostname}/${pathname || ''}`;
    } catch {
      return task.source.slice(0, 60);
    }
  }
  return task.source;
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

  // 用 ref 存储当前状态和 taskId，供 SSE 回调中判断（SSE 回调是闭包，无法直接读 state）
  const currentStatusRef = useRef(state.status);
  currentStatusRef.current = state.status;
  const currentTaskIdRef = useRef(state.taskId);
  currentTaskIdRef.current = state.taskId;

  const { connect: connectSSE } = useSSE({
    onProgress: (data) => {
      // 收到 progress 时若仍处于 queued/submitting 状态，说明任务已开始执行
      // 需先切换到 converting，再更新进度，否则进度条文案仍显示"前方有任务"
      if (currentStatusRef.current === 'queued' || currentStatusRef.current === 'submitting') {
        dispatch({ type: 'START_CONVERTING', payload: { taskId: currentTaskIdRef.current! } });
      }
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
    onQueued: () => {
      // queued 事件：任务在全局队列中等待，status 已由 START_QUEUED 设置，无需额外处理
    },
  });

  /** 拿到 taskId 后建立 SSE 连接，开始监听转码进度 */
  const startConvertProgress = useCallback((taskId: string, format: OutputFormat) => {
    currentFormatRef.current = format;
    dispatch({ type: 'START_CONVERTING', payload: { taskId } });
    connectSSE(taskId);
  }, [connectSSE]);

  /** 拿到 taskId，但任务处于排队中 */
  const startQueued = useCallback((taskId: string, format: OutputFormat) => {
    currentFormatRef.current = format;
    dispatch({ type: 'START_QUEUED', payload: { taskId } });
    connectSSE(taskId);
  }, [connectSSE]);

  /**
   * 恢复监听：用户刷新后命中 blocked 状态，点击某个活跃任务直接接续 SSE
   * format 从 activeTasks 里读取
   */
  const handleResume = useCallback((task: ActiveTaskSummary) => {
    currentFormatRef.current = task.format;
    dispatch({ type: 'START_QUEUED', payload: { taskId: task.taskId } });
    connectSSE(task.taskId);
  }, [connectSSE]);

  /** URL 模式：提交链接 */
  const handleUrlSubmit = useCallback(async (url: string, format: OutputFormat, segments?: TimeSegment[]) => {
    dispatch({ type: 'START_SUBMITTING' });
    try {
      const { taskId } = await submitUrlConvert({ url, format, segments });
      startQueued(taskId, format);
    } catch (err) {
      if (err instanceof TaskLimitError) {
        // 并发超限：展示正在进行的任务，让用户选择恢复监听
        dispatch({ type: 'BLOCKED', payload: err.activeTasks });
      } else {
        dispatch({ type: 'ERROR', payload: err instanceof Error ? err.message : '提交失败，请重试' });
      }
    }
  }, [startQueued]);

  /** 文件模式：分片上传完成，拿到 taskId + format */
  const handleFileTaskCreated = useCallback((taskId: string, format: OutputFormat) => {
    startQueued(taskId, format);
  }, [startQueued]);

  const isLoading = ['uploading', 'submitting', 'queued', 'converting'].includes(state.status);

  const getProgressLabel = (): string => {
    if (state.status === 'submitting') return '提交中...';
    if (state.status === 'queued') return '排队等待中，前方有任务正在执行...';
    if (state.status === 'converting') {
      return state.convertStage === 'downloading' ? '下载视频中...' : '音频转码中...';
    }
    return '';
  };

  const getProgressPercent = (): number => {
    if (state.status === 'submitting') return 5;
    if (state.status === 'queued') return 0;
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

        {/* 并发超限：展示正在进行的任务，提供恢复监听入口 */}
        {state.status === 'blocked' && state.activeTasks && (
          <div className={styles.blockedBox}>
            <p className={styles.blockedTitle}>⏳ 您有任务正在进行中</p>
            <p className={styles.blockedHint}>点击任务可恢复进度监听</p>
            <ul className={styles.activeTaskList}>
              {state.activeTasks.map((task) => (
                <li key={task.taskId} className={styles.activeTaskItem}>
                  <div className={styles.activeTaskInfo}>
                    <span className={styles.activeTaskFormat}>{task.format.toUpperCase()}</span>
                    <span className={styles.activeTaskSource} title={task.source}>
                      {formatSource(task)}
                    </span>
                    <span className={styles.activeTaskStatus}>
                      {task.status === 'pending' ? '排队中' : '转换中'}
                    </span>
                  </div>
                  <button
                    className={styles.resumeBtn}
                    onClick={() => handleResume(task)}
                  >
                    恢复监听
                  </button>
                </li>
              ))}
            </ul>
            <button
              className={styles.retryBtn}
              onClick={() => dispatch({ type: 'RESET' })}
            >
              等任务完成后再试
            </button>
          </div>
        )}

        {/* 进行中（包含排队等待）：进度条 */}
        {(state.status === 'submitting' || state.status === 'queued' || state.status === 'converting') && (
          <div className={styles.progressWrapper}>
            <ProgressBar
              percent={getProgressPercent()}
              label={getProgressLabel()}
              indeterminate={state.status === 'queued'}
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
                onTaskLimited={(tasks) => dispatch({ type: 'BLOCKED', payload: tasks })}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
