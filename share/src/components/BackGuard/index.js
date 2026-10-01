/* BackGuard — the app's single owner of the back gesture.

   One stack, one history-state key, one popstate listener. See backStack.js
   for the mechanism and why "press back again" is the only exit that works.

     AppExitGuard                 mount ONCE in the app shell: the root
     useBackLayer(open, onBack)   while this is open, back closes it
     useExitGuard({ isRoot })     the app root: back again to leave
     ExitHint                     what the first press at the root answers with
     setFallback(fn)              app-level rules for unclaimed presses */

export { useBackLayer } from './useBackLayer';
export { useExitGuard } from './useExitGuard';
export { ExitHint } from './ExitHint';
export { pushLayer, releaseLayer, setFallback, rearmTop, BACK_LAYER_FLAG } from './backStack';
export { AppExitGuard } from './AppExitGuard';
