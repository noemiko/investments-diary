import { NEW_CATEGORY_CHOICE, type ConfrontationPosition, type ReasonCategory } from "@/types";

/** What the confrontation panel shows for the category being chosen (US-01, FR-012). */
export type ConfrontationState =
  | { kind: "no-category" }
  | { kind: "unavailable" }
  /** `existingCategoryName` is set only when a typed new name matches an existing category. */
  | { kind: "history"; positions: ConfrontationPosition[]; existingCategoryName?: string };

/**
 * Resolves the form's category choice to the earlier positions it will be filed with. Pure, and run
 * from the island's initial values during SSR too, so a no-JS re-render shows the same panel.
 *
 * - `categoryChoice` is the select value: `""`, a category id, or `NEW_CATEGORY_CHOICE`.
 * - `earlierPositions` is `null` when they could not be loaded; it is already newest buy first.
 */
export function confrontationState(
  categoryChoice: string,
  newCategoryName: string,
  categories: ReasonCategory[],
  earlierPositions: ConfrontationPosition[] | null,
): ConfrontationState {
  if (!categoryChoice) {
    return { kind: "no-category" };
  }
  if (earlierPositions === null) {
    return { kind: "unavailable" };
  }
  if (categoryChoice === NEW_CATEGORY_CHOICE) {
    // Same rule as findCategoryId (and the server trims the name first), so the panel agrees with where the save files it.
    const wanted = newCategoryName.trim().toLowerCase();
    const existingCategory = categories.find((c) => c.name.toLowerCase() === wanted);
    return {
      kind: "history",
      positions: earlierPositions.filter((p) => p.category_id === existingCategory?.id),
      existingCategoryName: existingCategory?.name,
    };
  }
  return { kind: "history", positions: earlierPositions.filter((p) => p.category_id === categoryChoice) };
}
