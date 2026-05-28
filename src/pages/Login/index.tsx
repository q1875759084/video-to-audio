import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import styles from './index.module.scss';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!account.trim() || !password) {
      setErrorMsg('请填写账号和密码');
      return;
    }

    setErrorMsg('');
    setIsLoading(true);

    try {
      await login({ account, password });
      navigate('/', { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : '登录失败，请重试';
      setErrorMsg(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <h1>🎵 音频提取工具</h1>
          <p>从视频中提取音频，快速下载</p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label htmlFor="account">账号</label>
            <input
              id="account"
              type="text"
              placeholder="请输入用户名"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              autoComplete="username"
              autoFocus
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password">密码</label>
            <input
              id="password"
              type="password"
              placeholder="请输入密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          {errorMsg && <p className={styles.error}>{errorMsg}</p>}

          <button
            type="submit"
            className={styles.submitBtn}
            disabled={isLoading}
          >
            {isLoading ? '登录中...' : '登录'}
          </button>
        </form>
      </div>
    </div>
  );
}
