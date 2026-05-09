import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/index.scss'

/**
 * 全局错误边界：防止 SDK 初始化失败等未捕获异常导致白屏
 */
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] 捕获到未处理异常:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: 24,
          textAlign: 'center',
          fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
          color: '#666',
        }}>
          <h3 style={{ color: '#ff4d4f', marginBottom: 12 }}>⚠️ 插件加载失败</h3>
          <p style={{ marginBottom: 8 }}>请确认在飞书多维表格环境中打开此插件</p>
          <p style={{ marginBottom: 8 }}>如果问题持续，请尝试刷新页面</p>
          <details style={{
            textAlign: 'left',
            background: '#f5f5f5',
            padding: 12,
            borderRadius: 6,
            fontSize: 12,
            maxHeight: 200,
            overflow: 'auto',
          }}>
            <summary style={{ cursor: 'pointer', marginBottom: 8 }}>错误详情</summary>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
              {this.state.error?.message || '未知错误'}
            </pre>
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
