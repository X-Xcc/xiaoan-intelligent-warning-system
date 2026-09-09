import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import AnnotationEditor from './pages/AnnotationEditor.tsx';
import WorkspaceNav from './components/WorkspaceNav.tsx';
import { ToastProvider } from './components/Toast.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <WorkspaceNav />
        <AnnotationEditor />
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
