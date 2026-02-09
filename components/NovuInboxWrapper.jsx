import NovuInbox from '@/components/NovuInbox';

export default function NovuInboxWrapper({ subscriberId, ...props }) {
  return (
    <NovuInbox
      subscriberId={subscriberId}
      {...props}
    />
  );
}