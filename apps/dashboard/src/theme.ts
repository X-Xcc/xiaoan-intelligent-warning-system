import { theme, type ThemeConfig } from 'antd';

export const dashboardTheme: ThemeConfig = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: '#2458d3',
    colorInfo: '#2458d3',
    colorSuccess: '#12805c',
    colorWarning: '#a46313',
    colorError: '#c63c45',
    colorBgLayout: '#f5f6f8',
    colorBgContainer: '#ffffff',
    colorText: '#202938',
    colorTextSecondary: '#667085',
    colorBorder: '#d8dee8',
    colorBorderSecondary: '#e5e8ee',
    borderRadius: 6,
    borderRadiusLG: 8,
    fontSize: 14,
    fontFamily: '"Segoe UI","Microsoft YaHei UI","Microsoft YaHei","PingFang SC",system-ui,sans-serif',
    controlHeight: 36,
    controlHeightSM: 28,
    controlHeightLG: 44,
    wireframe: false,
  },
  components: {
    Button: { fontWeight: 500, primaryShadow: 'none', defaultShadow: 'none' },
    Card: { headerFontSize: 16, headerHeight: 52, bodyPadding: 20 },
    Table: { cellPaddingBlock: 14, cellPaddingInline: 16, headerBg: '#f8f9fb', headerColor: '#667085' },
    Segmented: { itemSelectedColor: '#2458d3', trackBg: '#f0f2f6' },
    Tabs: { horizontalItemGutter: 24 },
  },
};
