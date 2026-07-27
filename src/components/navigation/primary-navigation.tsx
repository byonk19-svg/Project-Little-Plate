"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { destinations } from "./destinations";

export function PrimaryNavigation() {
  const pathname = usePathname();

  return (
    <nav className="primary-navigation" aria-label="Primary navigation">
      <ul className="primary-navigation__list">
        {destinations.map((destination) => {
          const isCurrent = pathname === destination.href;

          return (
            <li key={destination.href}>
              <Link
                className="primary-navigation__link"
                href={destination.href}
                aria-current={isCurrent ? "page" : undefined}
              >
                <span>{destination.label}</span>
                {isCurrent ? (
                  <span className="primary-navigation__current">Current</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
