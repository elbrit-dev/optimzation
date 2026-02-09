import { useState, useEffect } from 'react';
import { NovuProvider, Inbox } from '@novu/react';

const NovuInbox = ({
  subscriberId,
  applicationIdentifier,
  subscriberHash,
  className,
  userPayload,
  ...props
}) => {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);

  const finalSubscriberId = subscriberId || userPayload?.subscriberId;
  const finalAppId = applicationIdentifier || process.env.NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER || 'sCfOsfXhHZNc';
  const finalHash = subscriberHash || process.env.NEXT_PUBLIC_NOVU_SUBSCRIBER_HASH;

  if (!isClient) return null;

  if (!finalSubscriberId || !finalAppId) {
    return (
      <div className={className} style={{ padding: '20px', textAlign: 'center' }}>
        <p>Novu Inbox: Configuration missing. Please provide subscriberId and applicationIdentifier.</p>
      </div>
    );
  }

  const tabs = [
    { label: 'All', filter: { tags: [] } },
    { label: 'Approval', filter: { tags: ['approval'] } },
    { label: 'Announcement', filter: { tags: ['announcement'] } },
  ];

  return (
    <div className={className} {...props}>
      <NovuProvider
        subscriberId={finalSubscriberId}
        applicationIdentifier={finalAppId}
        {...(finalHash && { subscriberHash: finalHash })}
      >
        <Inbox tabs={tabs} />
      </NovuProvider>
    </div>
  );
};

export default NovuInbox;
