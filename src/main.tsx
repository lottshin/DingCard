import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { fontLibrary } from './freeform/fontLibrary'
import './ui/index.css'

// Fonts imported in this browser draw everywhere: canvas, thumbnails, exports.
void fontLibrary.load()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
