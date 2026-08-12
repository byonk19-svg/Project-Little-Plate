import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/app-shell";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Little Plate Recipes",
    template: "%s | Little Plate Recipes"
  },
  description: "A private recipe box and manual meal planner for caregivers."
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f8f4ea"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
