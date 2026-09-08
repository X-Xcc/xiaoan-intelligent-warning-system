import React from 'react';
import ReactDOM from 'react-dom/client';
import { App as AntApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import 'antd/dist/reset.css';
import { DashboardApp } from './pages/DashboardApp';
import { dashboardTheme } from './theme';
import './styles.css';
import './styles/xiaoan-voice.css';
import { XiaoanVoiceProvider } from './components/XiaoanVoice';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider theme={dashboardTheme} locale={zhCN}>
      <AntApp>
        <XiaoanVoiceProvider>
          <DashboardApp />
        </XiaoanVoiceProvider>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>,
);
