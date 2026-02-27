'use client';

import DataTableNew from './DataTableNew';

// Wrapper that always uses new implementation
// Exported as DataTableComponent for backward compatibility
export default function DataTableComponent({
  useOrchestrationLayer = false,
  ...props
}) {
  return <DataTableNew {...props} useOrchestrationLayer={useOrchestrationLayer} />;
}
