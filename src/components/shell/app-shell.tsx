import type { ReactNode } from "react";

import { PrimaryNavigation } from "@/components/navigation/primary-navigation";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="app-header">
        <p className="app-header__eyebrow">Project Little Plate</p>
        <p className="app-header__promise">
          Know what to feed next, using what you already have.
        </p>
      </header>
      <aside className="app-shell__navigation">
        <PrimaryNavigation />
      </aside>
      <main className="app-shell__content" id="main-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
