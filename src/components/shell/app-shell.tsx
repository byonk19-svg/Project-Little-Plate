"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { WorkflowFeedbackForm } from "@/components/analytics/workflow-feedback-form";
import { PrimaryNavigation } from "@/components/navigation/primary-navigation";
import { NetworkStatus } from "@/components/network/network-status";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isFocusedFlow =
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/profile-setup") ||
    pathname.startsWith("/feeding-setup");

  return (
    <div className={`app-shell${isFocusedFlow ? " app-shell--focused" : ""}`}>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="app-header">
        <div>
          <p className="app-header__eyebrow">Project Little Plate</p>
          <p className="app-header__promise">
            Know what to feed next, using what you already have.
          </p>
        </div>
        {isFocusedFlow ? null : (
          <Link className="app-header__account" href="/account">
            Account
          </Link>
        )}
      </header>
      {isFocusedFlow ? null : (
        <aside className="app-shell__navigation">
          <PrimaryNavigation />
        </aside>
      )}
      <main className="app-shell__content" id="main-content" tabIndex={-1}>
        <NetworkStatus />
        {children}
        {isFocusedFlow ? null : <WorkflowFeedbackForm />}
      </main>
    </div>
  );
}
