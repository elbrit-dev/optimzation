'use client';

import DataProviderNew from './DataProviderNew';

export default function DataProvider({
  useLegacyProvider = false,
  useOrchestrationLayer = false,
  ...props
}) {
  const ProviderComponent = DataProviderNew;
  return <ProviderComponent {...props} useOrchestrationLayer={useOrchestrationLayer} />;
}
