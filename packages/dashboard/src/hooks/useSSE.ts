import { useEffect, useState } from 'react';

export function useSSE(url: string) {
  const [lastEvent, setLastEvent] = useState<MessageEvent | null>(null);

  useEffect(() => {
    const es = new EventSource(url);
    es.onmessage = (e) => setLastEvent(e);
    return () => es.close();
  }, [url]);

  return lastEvent;
}
