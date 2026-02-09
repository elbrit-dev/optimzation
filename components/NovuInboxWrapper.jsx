import { useOneSignalConnect } from '@/hooks/useOneSignalConnect';
import NovuInbox from '@/components/NovuInbox';

export default function NovuInboxWrapper({ subscriberId, ...props }) {
  // 🔑 This is where the hook must run
  useOneSignalConnect(subscriberId);

  return (
    <NovuInbox
      subscriber={subscriberId}
      {...props}
    />
  );
}