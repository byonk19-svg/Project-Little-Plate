import type { Metadata } from "next";

import { DestinationPage } from "@/components/shell/destination-page";

export const metadata: Metadata = {
  title: "Kitchen"
};

export default function KitchenPage() {
  return (
    <DestinationPage
      eyebrow="Prepare and store"
      title="Kitchen"
      description="One place for preparation work and trustworthy portion inventory."
      nextStep="Reviewed storage rules and auditable batch events will be added through later vertical slices."
    />
  );
}
