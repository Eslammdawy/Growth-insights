import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  title?: string;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="glass-panel flex flex-col items-center justify-center rounded-2xl border border-rose-300/60 bg-rose-50/50 p-6 text-center dark:border-rose-900/60 dark:bg-rose-950/20">
          <AlertTriangle className="h-6 w-6 text-rose-500" />
          <h3 className="mt-2 text-sm font-bold text-rose-900 dark:text-rose-200">
            {this.props.title ?? 'Failed to render component'}
          </h3>
          <p className="mt-1 text-xs text-rose-700/80 dark:text-rose-300/80">
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: undefined })}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-500"
          >
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
