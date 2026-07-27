import type { Metadata } from "next";

import { DestinationPage } from "@/components/shell/destination-page";

export const metadata: Metadata = {
  title: "Week"
};

export default function WeekPage() {
  return (
    <DestinationPage
      eyebrow="Plan ahead"
      title="Your week"
      description="A readable home for practical, component-based meals."
      nextStep="Manual planning arrives before automatic planning so every edit can stay understandable and safe."
    />
  );
}
