import { HistoryIcon } from './HistoryIcon';
import { HistoryPluginContent } from './HistoryPluginContent';

// Create custom history plugin
export function createHistoryPlugin() {
  return {
    title: 'Query History',
    icon: HistoryIcon,
    content: () => <HistoryPluginContent />,
  };
}

