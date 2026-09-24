import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { tagPlatform } from './lib/platform'

tagPlatform()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
