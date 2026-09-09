import { Link, useLocation } from "react-router-dom";
import { workspaceLinks } from "../navigation/routes";

export default function WorkspaceNav() {
  const location = useLocation();
  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-outline-variant shadow-sm">
      <div className="max-w-[1800px] mx-auto px-5 h-12 flex items-center gap-6">
        <span className="font-bold text-body text-primary tracking-tight shrink-0">长明灯</span>
        <div className="flex items-center gap-1">
          {workspaceLinks.map(({ label, href, icon: Icon }) => {
            const active = location.pathname === href;
            return (
              <Link key={href} to={href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-caption font-semibold transition-colors ${
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-on-surface-variant hover:bg-surface-container-high"
                }`}>
                <Icon size={14} />
                {label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
