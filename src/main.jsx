import React from 'react'
import { createRoot } from 'react-dom/client'
import { supabase } from './supabaseClient'
import './styles.css'

function App() {
  return <div className="app"><h1>BRK RepairOS</h1><p>Application connectée à Supabase.</p></div>
}

createRoot(document.getElementById('root')).render(<App />)
