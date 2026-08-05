import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import StmsApp from './StmsApp.jsx'

const mode = import.meta.env.VITE_MODE;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {mode === 'stms' ? <StmsApp /> : <App />}
  </React.StrictMode>
)