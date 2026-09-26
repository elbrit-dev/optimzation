'use client';

import DataProviderViews from '@/app/datatable/components/DataProviderViews';
import DataView from '@/app/datatable/components/DataView';

/* A data mode that mounts the screen the way a Studio page used to: inside
 * an Elbrit DataProvider (Views) on a saved query. The saved query follows
 * its OWN urlKey (usually ERP), not the harness environment; the token is
 * the one you are acting as. Kept so the provider path stays testable. */
export function providerMode({ presetDataSource, viewId, label = 'Saved query', paging = false }) {
  return {
    id: 'provider',
    label,
    note: `Inside an Elbrit DataProvider on the saved "${presetDataSource}" query — its own urlKey decides the ERP.`,
    use(ctx) {
      return {
        wrap: (node) => (
          <DataProviderViews
            presetDataSource={presetDataSource}
            presetName="Default"
            views={[{ id: viewId, label: viewId }]}
            showViewSwitcher={false}
            hideProviderHeader
            enableServerPaging={paging}
            pageSize={25}
            showPageSizeControl={false}
            showLoadMore={false}
            overrides={ctx.token ? { token: ctx.token } : undefined}
            contentPadding="none"
          >
            <DataView viewId={viewId}>{node}</DataView>
          </DataProviderViews>
        ),
      };
    },
  };
}
