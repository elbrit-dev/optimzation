"use client";
import React from "react";

/**
 * Contains a render error to its subtree instead of crashing the whole calendar.
 * Use around dynamic/data-driven sections (event details, comments) so one bad
 * record shows a small fallback rather than a blank client-side-exception page.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Surface in the console for debugging; never re-throw.
    console.error("Calendar section error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="p-4 text-sm text-muted-foreground">
            Couldn’t load this section. Please close and reopen.
          </div>
        )
      );
    }
    return this.props.children;
  }
}
