import React from 'react';

export const AlphaCaughtContext = React.createContext({
  alphaCaught: new Set(),
  toggleAlphaCaught: () => {}
});

