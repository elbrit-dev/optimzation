// import '../styles/globals.css';
import { DataProvider } from '@plasmicapp/host';
import { useEffect, useState, useCallback } from 'react';
import localforage from 'localforage';


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

  localforage: localforage,
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
          loadingScreen.classList.add('fade-out');
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
        <Component {...pageProps} />
      </DataProvider>
    </DataProvider>
  );
}

export default MyApp;
