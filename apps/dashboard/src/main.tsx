import React from 'react';
import ReactDOM from 'react-dom/client';
import { App as AntApp, ConfigProvider, theme } from 'antd';
import 'antd/dist/reset.css';
import { DashboardApp } from './pages/DashboardApp';
import './styles.css';

const dashboardTheme = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: '#0084ff',
    colorInfo: '#0084ff',
    borderRadius: 10,
    fontFamily: '"Inter","Microsoft YaHei UI","Microsoft YaHei","PingFang SC","Hiragino Sans GB",system-ui,sans-serif',
  },
  components: {
    Button: { controlHeight: 40 },
    Card: { borderRadiusLG: 14 },
    Segmented: { itemSelectedColor: '#0084ff' },
  },
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider theme={dashboardTheme}>
      <AntApp>
        <DashboardApp />
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>,
);
