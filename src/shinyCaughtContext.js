import React from 'react';

export const ShinyCaughtContext = React.createContext({
  shinyCaught: new Map(),
  addShinyEntry: () => {},
  updateShinyEntry: () => {},
  removeShinyEntry: () => {}
});
