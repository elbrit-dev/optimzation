'use client';

import { useRef } from 'react';

/* useRetained — the last non-null value, held while the value goes null.

   A sheet opened for "this doctor" is usually driven by one piece of state:
   set it to open, null it to close. The sheet then animates OUT for a beat
   after the state is already null, and anything it renders from that state
   would empty mid-slide — a blank title sliding away. Render from the
   retained value, open on the live one:

     const shown = useRetained(doc);
     <Sheet.Root open={doc != null} …>…{shown?.name}…</Sheet.Root> */

export function useRetained(value) {
  const ref = useRef(value);
  if (value != null) ref.current = value;
  return ref.current;
}
