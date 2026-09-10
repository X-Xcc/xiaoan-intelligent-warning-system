import React from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { CommandOperationsPage } from './pages/CommandOperationsPage';
import './styles/command-release.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: '#14766a', borderRadius: 4 } }}>
      <CommandOperationsPage />
    </ConfigProvider>
  </React.StrictMode>,
);
