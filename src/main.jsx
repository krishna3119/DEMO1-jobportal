import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

if (typeof document !== 'undefined') {
  document.documentElement.classList.remove('dark')
  try {
    localStorage.removeItem('theme')
  } catch {
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
