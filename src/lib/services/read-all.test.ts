import { describe, expect, it } from "vitest";
import { readAll } from "@/lib/services/read-all";

describe("readAll boundary failures", () => {
  it("rejects missing response data after a successful page instead of returning a partial result", async () => {
    const ranges: [number, number][] = [];
    await expect(
      readAll("positions", (from, to) => {
        ranges.push([from, to]);
        return Promise.resolve({ data: from === 0 ? ["first", "second"] : null, error: null });
      }),
    ).rejects.toThrow("missing response data");
    expect(ranges).toHaveLength(2);
    expect(ranges[0]?.[0]).toBe(0);
    expect(ranges[1]?.[0]).toBe(2);
    // Inclusive ranges have the same width; no assertion depends on the private batch size.
    expect(ranges[0]?.[1]).toBeGreaterThanOrEqual(0);
    expect(ranges[1]?.[1]).toBe((ranges[0]?.[1] ?? 0) + 2);
  });
});
