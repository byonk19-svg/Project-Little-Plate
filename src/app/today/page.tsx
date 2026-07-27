import type { Metadata } from "next";

import { DestinationPage } from "@/components/shell/destination-page";

export const metadata: Metadata = {
  title: "Today"
};

export default function TodayPage() {
  return (
    <DestinationPage
      eyebrow="Next meal"
      title="Today"
      description="A calm starting point for the next realistic meal."
      nextStep="A later ticket will connect reviewed preparations, valid inventory, and the next planned meal here."
    />
  );
}
