import { useNavigate, useLocation, Outlet, NavLink } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import { Search, Bell, Sun, Moon, Shield, ChevronDown } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { cn } from "../lib/utils";
import type { Camera } from "../types";
import Clock from "./Clock";
import { defaultAppRoute, homeRoute, sidebarRoutes, workspaceLinks } from "../navigation/routes";
import { createLayoutMonitorLinks, shouldOpenMonitorMenu } from "../services/layout-data";
import { loadLayoutCameras } from "../services/layout-service";

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggle } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [monitorOpen, setMonitorOpen] = useState(shouldOpenMonitorMenu(location.pathname, defaultAppRoute));
  const sidebarItems = sidebarRoutes;
  const annotationWorkspaceLink = workspaceLinks.find(link => link.label === "数据标注");
  const monitorLinks = useMemo(() => createLayoutMonitorLinks(cameras), [cameras]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await loadLayoutCameras();
        if (!cancelled) setCameras(data);
      } catch {
        // ignore layout camera refresh failures
      }
    }

    load();
    const iv = setInterval(load, 10000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  useEffect(() => {
    if (shouldOpenMonitorMenu(location.pathname, defaultAppRoute)) setMonitorOpen(true);
  }, [location.pathname]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background text-on-surface select-none">
      <header role="banner" className="h-[52px] bg-white/95 backdrop-blur-sm border-b border-outline-variant flex items-center justify-between px-5 z-50 shadow-sm/50 shrink-0">
        <div className="flex items-center gap-5">
          <button onClick={() => navigate(homeRoute)} className="flex items-center gap-2.5 cursor-pointer group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-blue-500 flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
              <Shield size={16} className="text-white" fill="currentColor" />
            </div>
            <span className="text-[15px] font-bold text-on-surface tracking-tight">长明灯</span>
          </button>
          <div className="h-5 w-px bg-outline-variant/50" />
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-outline group-focus-within:text-primary transition-colors" size={14} />
            <input type="text" placeholder="搜索..." aria-label="搜索"
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              className="bg-surface-container-low border border-transparent hover:border-outline-variant/50 focus:border-primary/30 rounded-lg h-8 pl-8.5 pr-3 text-[13px] w-56 focus:w-72 transition-all outline-none placeholder:text-outline/60" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Clock />
          <div className="h-5 w-px bg-outline-variant/50" />

          <button onClick={() => navigate("/alerts")} aria-label="通知"
            className="p-2 text-on-surface-variant hover:bg-surface-container-high hover:text-primary rounded-lg transition-all relative">
            <Bell size={17} />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-danger-red rounded-full" />
          </button>

          <button onClick={toggle} aria-label={theme === "light" ? "切换到暗色主题" : "切换到亮色主题"}
            className="p-2 text-on-surface-variant hover:bg-surface-container-high hover:text-primary rounded-lg transition-all">
            {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
          </button>

          <div className="h-5 w-px bg-outline-variant/50" />

        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside role="navigation" aria-label="主导航" className="w-[220px] flex flex-col bg-white border-r border-outline-variant/50 shrink-0 py-3">
          <nav className="flex-1 px-2.5 space-y-0.5 overflow-y-auto custom-scrollbar">
            {sidebarItems.map((item) => (
              <div key={item.path}>
                {item.hasCameraSubmenu ? (
                  <>
                    <button onClick={() => { setMonitorOpen(!monitorOpen); navigate(item.path); }}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-150 font-semibold text-[13px] group",
                        location.pathname === item.path
                          ? "bg-primary/10 text-primary border border-primary/15"
                          : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface border border-transparent"
                      )}>
                      {item.icon && <item.icon size={17} className={cn("transition-colors", location.pathname === item.path ? "text-primary" : "text-outline group-hover:text-on-surface-variant")} />}
                      <span className="flex-1 text-left">{item.label}</span>
                      <ChevronDown size={13} className={cn("transition-transform text-outline/60", monitorOpen && "rotate-180")} />
                    </button>
                    {monitorOpen && (
                      <div className="ml-4 mt-0.5 space-y-0.5 border-l border-outline-variant/40 pl-2.5">
                        {monitorLinks.map((cam) => (
                          <button key={cam.id}
                            onClick={() => navigate(cam.href)}
                            className={cn(
                              "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] transition-all",
                              location.search.includes(`cam=${cam.id}`)
                                ? "bg-primary/10 text-primary font-semibold"
                                : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
                            )}>
                            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", cam.isOnline ? "bg-success-green" : "bg-outline/40")} />
                            <span>{cam.label}</span>
                          </button>
                        ))}
                        {monitorLinks.length === 0 && (
                          <span className="block px-2 py-1.5 text-[11px] text-outline/60">暂无设备</span>
                        )}
                      </div>
                    )}
                  </>
                ) : item.icon ? (
                  <NavLink to={item.path}
                    className={({ isActive }) => cn(
                      "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-150 font-semibold text-[13px] group",
                      isActive
                        ? "bg-primary/10 text-primary border border-primary/15"
                        : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface border border-transparent"
                    )}>
                    <item.icon size={17} className={cn("transition-colors", location.pathname === item.path ? "text-primary" : "text-outline group-hover:text-on-surface-variant")} />
                    <span>{item.label}</span>
                  </NavLink>
                ) : null}
              </div>
            ))}
          </nav>

          <div className="px-2.5 mt-auto pt-3 border-t border-outline-variant/40 space-y-0.5">
            {annotationWorkspaceLink && (
              <button
                onClick={() => window.open(annotationWorkspaceLink.href, '_blank')}
                className="w-8 h-8 flex items-center justify-center rounded text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-all"
                title={annotationWorkspaceLink.label}
              >
                <annotationWorkspaceLink.icon size={15} />
              </button>
            )}

          </div>
        </aside>

        <main role="main" className="flex-1 overflow-auto bg-[#f4f6fb] p-5 custom-scrollbar relative">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
