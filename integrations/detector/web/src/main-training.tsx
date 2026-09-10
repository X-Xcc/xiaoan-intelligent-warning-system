import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import Training from './pages/Training.tsx';
import WorkspaceNav from './components/WorkspaceNav.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <WorkspaceNav />
      <Training />
    </BrowserRouter>
  </StrictMode>,
);
