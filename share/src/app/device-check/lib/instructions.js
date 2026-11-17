/* Fix-it steps for each failing check, by platform.

   Written for the people who actually see them: field staff on Android phones,
   mostly Chrome, some Samsung Internet, a few iPhones. Menu labels are the
   ones those browsers show today; where Chrome has renamed a setting, both
   names are given.

   Steps are plain strings with three bits of markup, rendered by DeviceCheck:
     {dots} {bars} {more} {tune} {lock}  the browser's own buttons, as icons
     "Quoted text"                         a label to look for, set in bold
     →                                     a menu path step, drawn as a chevron

   instructionsFor(id, code, platform, site) → { title, steps: string[] } | null */

const pick = (table, { os, browser }) =>
  table[`${os}:${browser}`] || table[os] || table.other;

const INCOGNITO_NOTE = 'If this is an Incognito / Private tab, close it and open the app in a normal tab.';

const DESKTOP = {
  'android:chrome': [
    'Tap {dots} at the top-right of Chrome.',
    'Untick "Desktop site". The page reloads in mobile view.',
    'If it turns itself back on: {dots} → Settings → Site settings → Desktop site → turn it OFF.',
  ],
  'android:samsung': [
    'Tap {bars} at the bottom-right.',
    'Tap "Mobile version" (or untick "Desktop version").',
  ],
  'android:edge': ['Tap {more} at the bottom.', 'Tap "View mobile site".'],
  'ios:safari': ['Tap "aA" at the left of the address bar.', 'Tap "Request Mobile Website".'],
  'ios:chrome': ['Tap {more} at the bottom-right.', 'Tap "Request Mobile Site".'],
  other: ['Open the browser menu.', 'Turn off "Desktop site" / "Request desktop site".'],
};

const LOCATION_BLOCKED = (site) => ({
  'android:chrome': [
    'Tap {tune} or {lock} at the left of the web address.',
    'Tap "Permissions" → "Location" → "Allow".',
    `Not there? {dots} → Settings → Site settings → Location → under "Blocked" tap ${site} → "Allow".`,
  ],
  'android:samsung': [
    'Tap {bars} → Settings → Sites and downloads → Site permissions → Location.',
    `Tap ${site} and choose "Allow".`,
  ],
  'ios:safari': [
    'Open the iPhone Settings app → Apps → Safari → Location → "Ask" or "Allow".',
    `Back in Safari, tap "aA" → Website Settings → Location → "Ask".`,
  ],
  'ios:chrome': ['Open the iPhone Settings app → Chrome → Location → "While Using the App".'],
  android: [`In your browser's Site settings, find Location and allow it for ${site}.`],
  other: [`In your browser's site settings, allow Location for ${site}.`],
});

const LOCATION_OS = {
  android: [
    'Open the phone Settings app → Apps → Chrome (or the browser you use) → Permissions → Location.',
    'Choose "Allow only while using the app".',
    'Swipe down from the top of the screen and make sure Location is ON.',
  ],
  ios: [
    'Open the iPhone Settings app → Privacy & Security → Location Services → turn it ON.',
    'In the same list tap "Safari Websites" (or Chrome) → "While Using the App".',
  ],
  other: ["In the device's settings, allow this browser to use location."],
};

const GPS_OFF = {
  android: ['Swipe down from the top of the screen and turn Location ON.', 'Step near a window or outdoors, then check again.'],
  ios: ['Settings → Privacy & Security → Location Services → turn it ON.'],
  other: ['Turn on location services on this device.'],
};

const LOCATION_UNSUPPORTED = {
  android: ['Open the app in Google Chrome, updated from the Play Store.'],
  ios: ['Open the app in Safari or Chrome, updated from the App Store.'],
  other: ['Open the app in an up-to-date Google Chrome.'],
};

const STORAGE_BLOCKED = (site) => ({
  'android:chrome': [
    INCOGNITO_NOTE,
    'Tap {dots} → Settings → Site settings.',
    'Open "On-device site data" (older Chrome: "Cookies") and turn ON "Allow sites to save data on your device" (or "Allow cookies").',
    `Check the "Blocked" list on that screen does not include ${site}.`,
  ],
  'android:samsung': [
    INCOGNITO_NOTE.replace('Incognito / Private', 'Secret mode'),
    'Tap {bars} → Settings → Privacy and security (or Sites and downloads).',
    'Turn ON "Accept cookies".',
  ],
  'ios:safari': [
    INCOGNITO_NOTE,
    'Open the iPhone Settings app → Apps → Safari.',
    'Turn OFF "Block All Cookies".',
  ],
  'ios:chrome': [INCOGNITO_NOTE, 'iPhone Settings → Chrome: make sure nothing there blocks cookies or website data.'],
  other: [INCOGNITO_NOTE, `In the browser's privacy settings allow cookies and site data for ${site}.`],
});

const STORAGE_FULL = (site) => ({
  android: [
    'Your phone is almost out of space, so the browser cannot save your sign-in.',
    'Open the phone Settings app → Storage (or Device care → Storage) and free at least 1 GB: delete old videos, WhatsApp media, and apps you do not use.',
    `Then in Chrome: {dots} → Settings → Site settings → All sites → ${site} → "Delete data". You will sign in again.`,
    'Close Chrome fully, open it again, and check again.',
  ],
  ios: [
    'Your iPhone is almost out of space, so the browser cannot save your sign-in.',
    'Open Settings → General → iPhone Storage and free at least 1 GB.',
    'Close the browser fully, open it again, and check again.',
  ],
  other: ['The device or browser is out of storage. Free some space, restart the browser, and check again.'],
});

const STORAGE_LOW = {
  android: ['Free some space soon: Settings → Storage → delete old videos, WhatsApp media, unused apps.'],
  ios: ['Free some space soon: Settings → General → iPhone Storage.'],
  other: ['Free some space on this device soon.'],
};

const WORKER = {
  other: [INCOGNITO_NOTE, 'Update the browser to the latest version. You can still continue; only offline mode and notifications are affected.'],
};

const GENERIC_ERROR = { other: ['Close the browser fully, open it again, and check again.', 'If it still fails, use "Need help?" on the sign-in screen.'] };

export function instructionsFor(id, code, platform, site = 'this site') {
  const p = platform || { os: 'other', browser: 'other' };
  switch (id) {
    case 'desktop':
      return { title: 'Turn off "Desktop site"', steps: pick(DESKTOP, p) };
    case 'location':
      if (code === 'blocked') return { title: 'Unblock location', steps: pick(LOCATION_BLOCKED(site), p) };
      if (code === 'os_blocked') return { title: 'Let the browser use location', steps: pick(LOCATION_OS, p) };
      if (code === 'gps_off') return { title: 'Turn on Location', steps: pick(GPS_OFF, p) };
      if (code === 'unsupported') return { title: 'Use a supported browser', steps: pick(LOCATION_UNSUPPORTED, p) };
      return null;
    case 'cookies':
    case 'local':
    case 'session':
    case 'indexeddb':
      if (code === 'full') return { title: 'Free up storage', steps: pick(STORAGE_FULL(site), p) };
      if (code === 'blocked') return { title: 'Allow cookies and site data', steps: pick(STORAGE_BLOCKED(site), p) };
      return { title: 'Restart the browser', steps: GENERIC_ERROR.other };
    case 'space':
      if (code === 'full') return { title: 'Free up storage', steps: pick(STORAGE_FULL(site), p) };
      if (code === 'low') return { title: 'Storage is running low', steps: pick(STORAGE_LOW, p) };
      return null;
    case 'worker':
      return code === 'unsupported' ? { title: 'Limited browser', steps: WORKER.other } : null;
    default:
      return { title: 'Restart the browser', steps: GENERIC_ERROR.other };
  }
}
