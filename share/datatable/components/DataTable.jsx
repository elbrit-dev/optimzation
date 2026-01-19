'use client';

import DataTableComponentOld from './DataTableOld';
import DataTableNew from './DataTableNew';

// Wrapper that switches between old and new implementations
// Exported as DataTableComponent for backward compatibility
export default function DataTableComponent({
  useOrchestrationLayer = false,
  ...props
}) {
  if (useOrchestrationLayer) {
    return <DataTableNew {...props} useOrchestrationLayer={useOrchestrationLayer} />;
  }
  return <DataTableComponentOld {...props} />;
}
