'use client'

import React from 'react'

// ---------------------------------------------------------------------------
// ErrorBoundary — class-based React error boundary
// ---------------------------------------------------------------------------

interface ErrorBoundaryProps {
  children: React.ReactNode
  onReset?: () => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log to console in dev; can be wired to an error reporting service
    console.error('[ErrorBoundary] Caught error:', error, info)
  }

  reset() {
    this.setState({ hasError: false, error: null })
    this.props.onReset?.()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-4 rounded-lg border border-zinc-800 bg-zinc-900 p-8 text-center">
          {/* Error icon */}
          <svg
            className="h-10 w-10 text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>

          <h2 className="text-lg font-semibold text-zinc-100">Algo salió mal</h2>

          {this.state.error && (
            <code className="max-w-full overflow-auto rounded bg-zinc-800 px-3 py-2 text-left text-sm text-zinc-400">
              {this.state.error.message}
            </code>
          )}

          <button
            onClick={() => this.reset()}
            className="mt-2 rounded-md bg-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-500"
          >
            Intentar de nuevo
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

// ---------------------------------------------------------------------------
// AsyncErrorBoundary — thin wrapper accepting an optional fallback prop
// ---------------------------------------------------------------------------

interface AsyncErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function AsyncErrorBoundary({ children, fallback }: AsyncErrorBoundaryProps) {
  if (fallback) {
    // Provide a custom fallback by wrapping ErrorBoundary and overriding render
    // We use a small adapter component so we can swap the fallback UI
    return (
      <ErrorBoundaryWithFallback fallback={fallback}>
        {children}
      </ErrorBoundaryWithFallback>
    )
  }
  return <ErrorBoundary>{children}</ErrorBoundary>
}

// Internal helper that renders a custom fallback instead of the default UI
class ErrorBoundaryWithFallback extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode; fallback: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[AsyncErrorBoundary] Caught error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback
    }
    return this.props.children
  }
}
