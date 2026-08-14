import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* Real, documented React Router v6 opt-in flags (not an upgrade,
        not a behavior change) — silences the two known v7-migration
        console warnings by explicitly opting into the same, already-
        default-in-v7 behavior early, exactly as React Router's own
        docs describe. Routing itself is unaffected: v7_relativeSplatPath
        only changes how RELATIVE paths resolve within a splat (*)
        route's matched segment — this app does have one real splat
        route (the "*" catch-all NotFound page), but verified directly
        that its own only Link uses an absolute path ("/owner/
        dashboard"), never a relative one, so nothing here is actually
        affected. v7_startTransition only wraps route updates in
        React's startTransition for smoother UI, a real, additive
        change with no route-matching effect. */}
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
