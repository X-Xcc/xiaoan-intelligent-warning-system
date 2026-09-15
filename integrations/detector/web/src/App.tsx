/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import AppErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./components/ThemeProvider";
import { ToastProvider } from "./components/Toast";
import { defaultAppRoute, homeRoute, appRoutes } from "./navigation/routes";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Monitor = lazy(() => import("./pages/Monitor"));
const Alerts = lazy(() => import("./pages/Alerts"));
const Devices = lazy(() => import("./pages/Devices"));
const Evidence = lazy(() => import("./pages/Evidence"));
const Analysis = lazy(() => import("./pages/Analysis"));
const Maintenance = lazy(() => import("./pages/Maintenance"));
const Audit = lazy(() => import("./pages/Audit"));
const Home = lazy(() => import("./pages/Home"));
const ModelTraining = lazy(() => import("./pages/ModelTraining"));
const Training = lazy(() => import("./pages/Training"));

const routeComponents = {
  Dashboard,
  Monitor,
  Alerts,
  Devices,
  Evidence,
  Analysis,
  Maintenance,
  Audit,
  ModelTraining,
  Training,
} as const;

function PageLoading() {
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path={homeRoute} element={<Home />} />
        <Route path="/login" element={<Navigate to={defaultAppRoute} replace />} />
        <Route element={<Layout />}>
          {appRoutes.map(route => {
            const Component = route.componentKey ? routeComponents[route.componentKey] : null;
            if (!Component) return null;

            return (
              <Route
                key={route.path}
                path={route.path}
                element={<AppErrorBoundary><Component /></AppErrorBoundary>}
              />
            );
          })}
        </Route>
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <Router>
            <AppRoutes />
          </Router>
        </ToastProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  );
}
