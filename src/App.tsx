import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import AgentsList from './pages/AgentsList';
import AgentForm from './pages/AgentForm';
import Instances from './pages/Instances';
import Conversations from './pages/Conversations';
import Settings from './pages/Settings';

function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#131c35',
            color: '#e8f0fe',
            border: '1px solid rgba(99, 179, 237, 0.2)',
            borderRadius: '10px',
            fontSize: '14px',
          },
          success: {
            iconTheme: {
              primary: '#10b981',
              secondary: '#131c35',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#131c35',
            },
          },
        }}
      />
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="agents" element={<AgentsList />} />
          <Route path="agents/:id" element={<AgentForm />} />
          <Route path="instances" element={<Instances />} />
          <Route path="conversations" element={<Conversations />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
