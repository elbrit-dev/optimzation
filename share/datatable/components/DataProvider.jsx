'use client';

import DataProviderNew from './DataProviderNew';
import DataProviderOld from './DataProviderOld';

export default function DataProvider({
  useLegacyProvider = false,
  useOrchestrationLayer = false,
  ...props
}) {
  const ProviderComponent = useLegacyProvider ? DataProviderOld : DataProviderNew;
  return <ProviderComponent {...props} useOrchestrationLayer={useOrchestrationLayer} />;
}
