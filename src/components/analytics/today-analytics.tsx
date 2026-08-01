"use client";

import { useEffect } from "react";

import { recordClientProductEvent } from "@/modules/analytics/actions";

type MealState = "ready" | "preparation_required" | "empty" | "unavailable";

function durationBucket(
  elapsedMilliseconds: number
): "under_10_seconds" | "10_to_30_seconds" | "over_30_seconds" {
  if (elapsedMilliseconds < 10_000) return "under_10_seconds";
  if (elapsedMilliseconds <= 30_000) return "10_to_30_seconds";
  return "over_30_seconds";
}

export function TodayAnalytics({
  eventKey,
  mealState
}: {
  eventKey: string;
  mealState: MealState;
}) {
  useEffect(() => {
    const openedAt = performance.now();
    void recordClientProductEvent({
      name: "today_opened",
      key: eventKey,
      state: mealState
    }).catch(() => undefined);
    let choiceRecorded = false;
    const handleChoice = (event: MouseEvent) => {
      if (choiceRecorded || !(event.target instanceof Element)) return;
      const target = event.target.closest<HTMLElement>("[data-meal-choice]");
      const choice = target?.dataset.mealChoice;
      if (choice !== "serve" && choice !== "prepare") {
        return;
      }
      choiceRecorded = true;
      void recordClientProductEvent({
        name: "meal_choice_timed",
        key: crypto.randomUUID(),
        state: choice,
        durationBucket: durationBucket(performance.now() - openedAt)
      }).catch(() => undefined);
    };
    document.addEventListener("click", handleChoice);
    return () => document.removeEventListener("click", handleChoice);
  }, [eventKey, mealState]);

  return null;
}
