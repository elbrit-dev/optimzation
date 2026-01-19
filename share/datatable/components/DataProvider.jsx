'use client';

import DataProviderOld from './DataProviderOld';
import DataProviderNew from './DataProviderNew';

export default function DataProvider({
  useOrchestrationLayer = false,
  ...props
}) {
  if (useOrchestrationLayer) {
    return <DataProviderNew {...props} useOrchestrationLayer={useOrchestrationLayer} />;
  }
  return <DataProviderOld {...props} />;
}
