'use client';

import DataProviderNew from './DataProviderNew';
import DataProviderOld from './DataProviderOld';

/** Set to true to use legacy provider (DataProviderOld / b1ab609) instead of DataProviderNew */
const USE_LEGACY_PROVIDER = false;

export default function DataProvider({
  useOrchestrationLayer = false,
  ...props
}) {
  const ProviderComponent = USE_LEGACY_PROVIDER ? DataProviderOld : DataProviderNew;
  return <ProviderComponent {...props} useOrchestrationLayer={useOrchestrationLayer} />;
}
