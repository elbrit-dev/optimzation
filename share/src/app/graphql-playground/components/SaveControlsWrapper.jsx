'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { SaveControls } from './SaveControls';

export function SaveControlsWrapper({ saveControlsRef }) {
  const [mounted, setMounted] = useState(false);
  const [container, setContainer] = useState(null);

  useEffect(() => {
    setMounted(true);
    // Wait for container to be available
    const checkContainer = () => {
      const el = document.getElementById('save-controls-container');
      if (el) {
        setContainer(el);
      } else {
        // Retry after a short delay
        setTimeout(checkContainer, 100);
      }
    };
    checkContainer();
  }, []);

  if (!mounted || !container) return null;

  return createPortal(<SaveControls ref={saveControlsRef} />, container);
}

