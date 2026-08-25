import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

console.log('[APP_RUNTIME_VERSION]', {
  buildTimestamp: Date.now(),
  environment: import.meta.env.MODE,
  firebaseMode: 'default_multiplexed'
});
console.log('[APP_BOOT_START] React is about to mount.');

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
console.log('[ReactRootRender] Mounting App component');
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
