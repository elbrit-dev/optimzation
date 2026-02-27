import '../styles/globals.css';
import 'primeicons/primeicons.css';
import '../firebase'; // Initialize Firebase
import { DataProvider } from '@plasmicapp/host';
import { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import Script from 'next/script';
import localforage from 'localforage';
import _ from 'lodash';
import "primereact/resources/themes/lara-light-cyan/theme.css";
import "primereact/resources/primereact.min.css";
// import "antd/dist/antd.css";

// GraphQL Playground styles
import '@graphiql/plugin-explorer/style.css';
import '@graphiql/react/style.css';
import 'graphiql/graphiql.css';
import 'graphiql/style.css';
import "../share/src/app/graphql-playground/styles/graphql-playground.css";

import "@calendar/styles/globals.css";

const flatten = (renameMapOrData, maybeData, options = {}) => {
  const flat = (obj, prefix = '', res = {}) => {
    if (Array.isArray(obj)) {
      obj.forEach((item, i) => flat(item, `${prefix}${prefix ? '_' : ''}${i}`, res));
    } else if (typeof obj === 'object' && obj !== null) {
      Object.entries(obj).forEach(([key, val]) => flat(val, `${prefix}${prefix ? '_' : ''}${key}`, res));
    } else {
      res[prefix] = obj;
    }
    return res;
  };

  const generatePrefixMap = (prefix = 'node_items_', replacement = null, count = 25) => {
    const map = {};
    for (let i = 0; i < count; i++) {
      map[`${prefix}${i}_`] = replacement;
    }
    return map;
  };

  let renameMap = {};
  let input = renameMapOrData;

  if (maybeData !== undefined) {
    renameMap = renameMapOrData || {};
    input = maybeData;
  }

  const prefixMap =
    typeof options.prefixMap === 'function' ? options.prefixMap(generatePrefixMap) : options.prefixMap || {};

  if (Array.isArray(input)) {
    return input.map((entry) => {
      const flatRow = flat(entry);
      const renamed = {};

      Object.entries(flatRow).forEach(([k, v]) => {
        let newKey = renameMap[k];

        if (!newKey) {
          const matchedPrefix = Object.entries(prefixMap).find(([prefix]) => k.startsWith(prefix));

          if (matchedPrefix) {
            const [prefix, replacement] = matchedPrefix;
            newKey = replacement === null ? k.replace(prefix, '') : k.replace(prefix, replacement);
          } else {
            newKey = k;
          }
        }

        renamed[newKey] = v;
      });

      return renamed;
    });
  }

  if (typeof input === 'object' && input !== null) {
    const result = {};
    Object.entries(input).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        result[key] = value.map((entry) => {
          const flatRow = flat(entry);
          const renamed = {};

          Object.entries(flatRow).forEach(([k, v]) => {
            let newKey = renameMap[k];

            if (!newKey) {
              const matchedPrefix = Object.entries(prefixMap).find(([prefix]) => k.startsWith(prefix));

              if (matchedPrefix) {
                const [prefix, replacement] = matchedPrefix;
                newKey = replacement === null ? k.replace(prefix, '') : k.replace(prefix, replacement);
              } else {
                newKey = k;
              }
            }

            renamed[newKey] = v;
          });

          return renamed;
        });
      } else {
        result[key] = value;
      }
    });
    return result;
  }

  return input;
};

const a = {
  explodeWithParent: (data = [], options = {}) => {
    const {
      itemPath = "node.items",
      parentPrefix = "",
      childPrefix = "",
      includeParentPaths = []
    } = options;
  
    const get = (obj, path) =>
      path.split('.').reduce((o, k) => (o ? o[k] : undefined), obj);
  
    const flattenNested = (obj, prefix = '', res = {}) => {
      if (!obj || typeof obj !== 'object') return res;
      for (const [k, v] of Object.entries(obj)) {
        const newKey = prefix ? `${prefix}_${k}` : k;
        if (Array.isArray(v)) {
          continue;
        }
        if (v && typeof v === 'object') {
          flattenNested(v, newKey, res);
        } else {
          res[newKey] = v;
        }
      }
      return res;
    };
  
    return data.flatMap(entry => {
      const parentPath = itemPath.split('.').slice(0, -1).join('.');
      const parentObject = parentPath ? get(entry, parentPath) : entry;
      const parentFlatFull = flattenNested(parentObject, parentPrefix);
  
      const parentFlat = includeParentPaths.length > 0
        ? Object.fromEntries(
            Object.entries(parentFlatFull).filter(([k]) =>
              includeParentPaths.includes(k)
            )
          )
        : parentFlatFull;
  
      const items = get(entry, itemPath) || [];
  
      return items.map(child => {
        const childFlat = flattenNested(child, childPrefix);
        return {
          ...parentFlat,
          ...childFlat
        };
      });
    });
  },

  flatten,
  
  log: (...args) => {
    console.log(`${new Date().toISOString()}`, ...args);
  },

  enocdeui: (value) => {
    const text = value == null ? '' : String(value);
    try { return encodeURI(text); } catch (e) { return text; }
  },
  encodeuicompeont: (value) => {
    const text = value == null ? '' : String(value);
    try { return encodeURIComponent(text); } catch (e) { return text; }
  },
  decodeui: (value) => {
    const text = value == null ? '' : String(value);
    try { return decodeURI(text); } catch (e) { return text; }
  },
  decodeuicompoent: (value) => {
    const text = value == null ? '' : String(value);
    try { return decodeURIComponent(text); } catch (e) { return text; }
  },
  textToBase64: (value) => {
    const text = value == null ? '' : String(value);
    try { 
      if (typeof window !== 'undefined' && typeof btoa !== 'undefined') {
        return btoa(text);
      }
      // Fallback for Node.js environment
      if (typeof Buffer !== 'undefined') {
        return Buffer.from(text, 'utf8').toString('base64');
      }
      return text;
    } catch (e) { 
      return text; 
    }
  },

  base64ToBlob: (base64String, mimeType = 'application/octet-stream') => {
    try {
      if (!base64String || typeof base64String !== 'string') return null;
      const [prefix, data] = base64String.split(',');
      const base64Data = data || base64String;
      const detectedMime = prefix?.match(/data:([^;]+)/)?.[1] || mimeType;
      return new Blob([Uint8Array.from(atob(base64Data), c => c.charCodeAt(0))], { type: detectedMime });
    } catch (e) {
      return null;
    }
  },

  localforage: localforage,
  
  _: _,
  // ✅ Division function: divides value by divisor, multiplies by 100, formats to decimal places
  // Usage: $ctx.fn.percentage(value, divisor, decimalPlaces)
  // Example: $ctx.fn.percentage($props.incentive, $props.target, 1)
  percentage: (value, divisor, decimalPlaces = 1) => {
    if (value && divisor) {
      const result = (value / divisor) * 100;
      // Round to specified decimal places and return as number
      const multiplier = Math.pow(10, decimalPlaces);
      return Math.round(result * multiplier) / multiplier;
    }
    return 0;
  },

  // ✅ Normal division function: divides value by divisor, formats to decimal places (no 100 multiplication)
  // Usage: $ctx.fn.divide(value, divisor, decimalPlaces)
  // Example: $ctx.fn.divide(10, 3, 2) returns 3.33
  divide: (value, divisor, decimalPlaces = 1) => {
    if (value && divisor) {
      const result = value / divisor;
      // Round to specified decimal places and return as number
      const multiplier = Math.pow(10, decimalPlaces);
      return Math.round(result * multiplier) / multiplier;
    }
    return 0;
  }
};

if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    
    if (event.reason instanceof TypeError) {
      console.warn('TypeError detected in promise rejection. This might be an authentication race condition.');
      event.preventDefault();
    }
  });
  
  window.addEventListener('error', (event) => {
    console.error('Global error caught:', event.error);
    
    if (event.error instanceof TypeError) {
      console.warn('TypeError detected in global error handler.');
    }
  });
}

function MyApp({ Component, pageProps }) {
  const [globalState, setGlobalState] = useState({});
  // console.log('globalState', process.env);
  const setState = useCallback((stateName, data, callback) => {
    if (typeof stateName === 'string') {
      setGlobalState(prev => {
        const newState = {
          ...prev,
          [stateName]: data
        };
        if (typeof callback === 'function') {
          setTimeout(() => {
            try {
              callback(newState[stateName], stateName, newState);
            } catch (error) {
              console.error('Error in setState callback:', error);
            }
          }, 0);
        } else if (callback !== undefined && callback !== null) {
          console.warn('setState callback must be a function. Received:', typeof callback);
        }
        return newState;
      });
    } else if (typeof stateName === 'object' && stateName !== null) {
      const actualCallback = typeof data === 'function' ? data : callback;
      setGlobalState(prev => {
        const newState = {
          ...prev,
          ...stateName
        };
        if (typeof actualCallback === 'function') {
          setTimeout(() => {
            try {
              actualCallback(newState);
            } catch (error) {
              console.error('Error in setState callback:', error);
            }
          }, 0);
        }
        return newState;
      });
    }
  }, []);

  const fnWithState = {
    ...a,
    setState
  };

  useEffect(() => {
    // Service Worker Registration
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js').then(
          function(registration) {
            console.log('Service Worker registration successful with scope: ', registration.scope);
          },
          function(err) {
            console.log('Service Worker registration failed: ', err);
          }
        );
      });
    }

    const loadingScreen = document.getElementById('app-loading-screen');
    const loadingGif = document.querySelector('.loading-gif');
    
    if (loadingScreen && loadingGif) {
      let animationCompleted = false;
      let appReady = false;
      
      const MIN_DISPLAY_TIME = 3000;
      
      setTimeout(() => {
        appReady = true;
        checkAndHideLoader();
      }, 500);
      
      setTimeout(() => {
        animationCompleted = true;
        checkAndHideLoader();
      }, MIN_DISPLAY_TIME);
      
      function checkAndHideLoader() {
        if (animationCompleted && appReady) {
          loadingScreen.classList.add('loading-hidden');
          document.body.classList.add('loaded');
          setTimeout(() => {
            loadingScreen.remove();
          }, 500);
        }
      }
    }
  }, []);

  return (
    <DataProvider name="fn" data={fnWithState}>
      <DataProvider name="state" data={globalState}>
        <Head>
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
          <meta name="theme-color" content="#ffffff" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-status-bar-style" content="default" />
          <meta name="apple-mobile-web-app-title" content="Elbrit One" />
          <meta name="format-detection" content="telephone=no" />
          <meta name="mobile-web-app-capable" content="yes" />
          <meta name="msapplication-TileColor" content="#ffffff" />
          <meta name="msapplication-tap-highlight" content="no" />
          
          <link rel="manifest" href="/manifest.webmanifest" />
          <link rel="apple-touch-icon" href="/logo.svg" />
          <link rel="shortcut icon" href="/favicon.ico" />
        </Head>
        <Script
          src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"
          strategy="afterInteractive"
          defer
        />
        <Script id="onesignal-init" strategy="afterInteractive">
          {`
            window.OneSignalDeferred = window.OneSignalDeferred || [];
            OneSignalDeferred.push(async function(OneSignal) {
              await OneSignal.init({
                appId: "9cc963c3-d3c9-4230-b817-6860109d8f3f",
              });
            });
          `}
        </Script>
        
        <Component {...pageProps} />
      </DataProvider>
    </DataProvider>
  );
}

export default MyApp;
