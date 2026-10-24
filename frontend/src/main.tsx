import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { BrowserRouter } from 'react-router-dom'
import { AuthContextProvider } from './context/AuthContext'
import { SocketContextProvider } from './context/SocketContext'

const root = document.getElementById('root')
if (!root) throw new Error("index.html has no element with id root to render into")

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthContextProvider>
        {/* Inside the auth provider: the socket connects only when someone is logged in */}
        <SocketContextProvider>
          <App />
        </SocketContextProvider>
      </AuthContextProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
