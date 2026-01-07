'use client';

import React from 'react';
import { PlasmicRootProvider } from "@plasmicapp/loader-nextjs";
import { PLASMIC } from "@/plasmic-init";

export default function PlasmicClientRootProvider({ children, prefetchedData }) {
  return (
    <PlasmicRootProvider loader={PLASMIC} prefetchedData={prefetchedData}>
      {children}
    </PlasmicRootProvider>
  );
}

