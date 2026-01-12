'use client';

import { createContext, useContext } from 'react';

const TableContext = createContext(null);

export const TableProvider = ({ children, value }) => {
  return (
    <TableContext.Provider value={value}>
      {children}
    </TableContext.Provider>
  );
};

export const useTableContext = () => useContext(TableContext);

