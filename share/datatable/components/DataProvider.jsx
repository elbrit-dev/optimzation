'use client';

import DataProviderNew from './DataProviderNew';

export default function DataProvider({
  useOrchestrationLayer = false,
  ...props
}) {
  return <DataProviderNew {...props} useOrchestrationLayer={useOrchestrationLayer} />;
}
