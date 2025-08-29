import React from 'react';

export const CaughtContext = React.createContext({
  caught: new Set(),
  toggleCaught: () => {}
});