import { NavLink, Outlet } from "react-router-dom";
import { ClaudeCodeLauncher } from "../components/ClaudeCodeLauncher";
import { useT } from "../i18n/store";

function navClass({ isActive }: { isActive: boolean }): string {
  return "app-nav-link" + (isActive ? " active" : "");
}

/**
 * Three top-level destinations (plan §11.2) — Home, Vault, Tricks. Health
 * used to be a fourth top-level item; it's now reachable from inside
 * Vault (VaultShell's sub-nav) instead of competing with these three.
 */
export function AppShell() {
  const t = useT();
  return (
    <div className="app-shell">
      <header className="app-topbar">
        <NavLink to="/" end className="brand">
          Raymond
        </NavLink>
        <nav className="app-nav">
          <NavLink to="/" end className={navClass}>
            {t.nav.home}
          </NavLink>
          <NavLink to="/vault" className={navClass}>
            {t.nav.vault}
          </NavLink>
          <NavLink to="/tricks" className={navClass}>
            {t.nav.tricks}
          </NavLink>
        </nav>
      </header>
      <div className="app-body">
        <Outlet />
      </div>
      <ClaudeCodeLauncher />
    </div>
  );
}
