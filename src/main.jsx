// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

const initialScale = parseInt(localStorage.getItem('uiScale'), 10);
if (Number.isFinite(initialScale)) {
  document.body.style.zoom = initialScale / 100;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
