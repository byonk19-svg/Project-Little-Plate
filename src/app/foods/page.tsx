import type { Metadata } from "next";

import { DestinationPage } from "@/components/shell/destination-page";

export const metadata: Metadata = {
  title: "Foods"
};

export default function FoodsPage() {
  return (
    <DestinationPage
      eyebrow="Reviewed catalog"
      title="Foods"
      description="A deliberately small home for reviewed foods and preparations."
      nextStep="Only active records with complete source and review metadata will become selectable here."
    />
  );
}
