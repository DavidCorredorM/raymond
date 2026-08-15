import { NavLink, Outlet } from "react-router-dom";

function navClass({ isActive }: { isActive: boolean }): string {
  return "app-nav-link" + (isActive ? " active" : "");
}

/**
 * Three top-level destinations (plan §11.2) — Home, Vault, Tricks. Health
 * used to be a fourth top-level item; it's now reachable from inside
 * Vault (VaultShell's sub-nav) instead of competing with these three.
 */
export function AppShell() {
  return (
    <div className="app-shell">
      <header className="app-topbar">
        <NavLink to="/" end className="brand">
          Raymond
        </NavLink>
        <nav className="app-nav">
          <NavLink to="/" end className={navClass}>
            Home
          </NavLink>
          <NavLink to="/vault" className={navClass}>
            Vault
          </NavLink>
          <NavLink to="/tricks" className={navClass}>
            Tricks
          </NavLink>
        </nav>
      </header>
      <div className="app-body">
        <Outlet />
      </div>
    </div>
  );
}
