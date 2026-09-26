'use client';

import { useState, useEffect } from 'react';
import React from 'react';
import { ToolbarPlaceholder } from './ToolbarPlaceholder';

export function GraphiQLWrapper({ children, ...props }) {
  const [GraphiQLModule, setGraphiQLModule] = useState(null);

  useEffect(() => {
    import('graphiql').then((mod) => {
      setGraphiQLModule(mod);
    });
  }, []);

  if (!GraphiQLModule) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-600">Loading GraphQL Playground...</div>
      </div>
    );
  }

  const GraphiQL = GraphiQLModule.GraphiQL;
  const Toolbar = GraphiQL.Toolbar;

  // Convert initialVariables from object to JSON string if needed
  const processedProps = { ...props };
  if (processedProps.initialVariables && typeof processedProps.initialVariables === 'object') {
    try {
      processedProps.initialVariables = JSON.stringify(processedProps.initialVariables);
    } catch (e) {
      // Failed to stringify initialVariables, using as is
    }
  }

  const processedChildren = React.Children.map(children, (child) => {
    if (React.isValidElement(child) && child.type === ToolbarPlaceholder) {
      return React.createElement(Toolbar, child.props);
    }
    return child;
  });

  return <GraphiQL {...processedProps}>{processedChildren}</GraphiQL>;
}

