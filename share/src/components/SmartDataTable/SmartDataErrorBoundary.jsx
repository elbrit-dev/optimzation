'use client';

import { Component } from 'react';

export class SmartDataErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, errorInfo: null, copied: false };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('[SmartDataTable] Uncaught error:', error, errorInfo);
  }

  handleCopy = () => {
    const { error, errorInfo } = this.state;
    const text = [
      `Error: ${error?.message}`,
      '',
      'Stack trace:',
      error?.stack ?? '(unavailable)',
      '',
      'Component stack:',
      errorInfo?.componentStack ?? '(unavailable)',
    ].join('\n');
    navigator.clipboard?.writeText(text).then(() => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    });
  };

  handleReset = () => {
    this.setState({ error: null, errorInfo: null, copied: false });
  };

  render() {
    const { error, errorInfo, copied } = this.state;
    if (!error) return this.props.children;

    const isDev = process.env.NODE_ENV === 'development';
    const { label = 'table' } = this.props;

    return (
      <div className="flex flex-col items-center justify-center p-4 sm:p-10 gap-4 min-h-[200px]">
        <div className="bg-white border border-red-200 rounded-lg shadow-sm w-full max-w-2xl p-4 sm:p-6 flex flex-col items-center gap-4">

          {/* Icon + heading */}
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="w-12 h-12 rounded-full bg-red-50 border border-red-200 flex items-center justify-center">
              <i className="pi pi-exclamation-triangle text-red-500 text-xl" />
            </span>
            <p className="text-gray-800 font-semibold text-base">Failed to render {label}</p>
            <p className="text-gray-500 text-sm max-w-md">{error.message}</p>
          </div>

          {/* Stack trace — dev only */}
          {isDev && (
            <pre className="w-full bg-gray-50 border border-gray-200 rounded-md p-3 text-[11px] text-gray-600 leading-relaxed overflow-auto max-h-52 whitespace-pre-wrap break-all">
              {error.stack}
              {errorInfo?.componentStack && `\n\nComponent stack:${errorInfo.componentStack}`}
            </pre>
          )}

          {/* Actions */}
          <div className="flex flex-wrap justify-center gap-2">
            <button
              onClick={this.handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <i className={`pi ${copied ? 'pi-check text-green-600' : 'pi-copy text-gray-500'} text-xs`} />
              {copied ? 'Copied!' : 'Copy debug info'}
            </button>
            <button
              onClick={this.handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
            >
              <i className="pi pi-refresh text-xs" />
              Retry
            </button>
          </div>

        </div>
      </div>
    );
  }
}
