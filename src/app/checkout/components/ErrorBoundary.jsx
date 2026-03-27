"use client";
import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error to console for debugging
    console.error("Checkout Error Boundary caught an error:", error, errorInfo);
    
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center space-y-6">
            <AlertTriangle className="mx-auto h-16 w-16 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-800">Something went wrong</h1>
            <p className="text-gray-600">
              We encountered an error during checkout. Please try again or contact support if the problem persists.
            </p>
            
            {process.env.NODE_ENV === 'development' && (
              <details className="text-left bg-red-50 rounded-lg p-4 text-sm">
                <summary className="cursor-pointer font-medium text-red-800 mb-2">
                  Error Details (Development)
                </summary>
                <pre className="text-red-700 whitespace-pre-wrap text-xs">
                  {this.state.error && this.state.error.toString()}
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
            
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={this.handleRetry}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-xl transition-all duration-200 flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
              <button
                onClick={() => (window.location.href = "/")}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 px-4 rounded-xl transition-all duration-200"
              >
                Go Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;