import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PrimaryNavigation } from "./primary-navigation";

const pathname = vi.hoisted(() => ({ value: "/week" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value
}));

describe("PrimaryNavigation", () => {
  it("exposes all four destinations and identifies the current one in text and semantics", () => {
    render(<PrimaryNavigation />);

    expect(
      screen.getByRole("navigation", { name: "Primary navigation" })
    ).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(4);

    const currentLink = screen.getByRole("link", { name: /Week.*Current/ });
    expect(currentLink).toHaveAttribute("href", "/week");
    expect(currentLink).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Today" })).not.toHaveAttribute(
      "aria-current"
    );
  });

  it("keeps every destination in the keyboard tab order", async () => {
    const user = userEvent.setup();
    render(<PrimaryNavigation />);

    for (const name of ["Today", /Week.*Current/, "Recipes", "Kitchen"]) {
      await user.tab();
      expect(screen.getByRole("link", { name })).toHaveFocus();
    }
  });
});
