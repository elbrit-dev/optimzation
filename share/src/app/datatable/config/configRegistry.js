/**
 * DataTable config registry - manual registration like offline resources.
 *
 * defaultConfigId: which config is selected by default in the dropdown and used for initial page state.
 *
 * To add a new config:
 * 1. Create config/configs/myConfig.js with: export const defaultDataTableConfig = { ... };
 * 2. Import it here and add to configRegistry:
 *    import { defaultDataTableConfig as myConfig } from './configs/myConfig';
 *    configRegistry.myConfig = { id: 'myConfig', displayName: 'My Config', config: myConfig, source: 'local' };
 * 3. Run generate-config script (preset editor auto-includes all files in configs/)
 */
import { defaultDataTableConfig } from './configs/defaultConfig';
import { defaultDataTableConfig as slotConfig } from './configs/slotConfig';

/** Config id selected by default in the dropdown and used for initial page state */
export const defaultConfigId = 'slotConfig';

const configRegistry = {
  defaultConfig: {
    id: 'defaultConfig',
    displayName: 'Default Config',
    config: defaultDataTableConfig,
    source: 'local',
  },
  slotConfig: {
    id: 'slotConfig',
    displayName: 'Slot Config',
    config: slotConfig,
    source: 'local',
  },
};

export default configRegistry;
