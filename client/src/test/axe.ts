import axe, { type ElementContext } from "axe-core";
import { expect } from "vitest";

/**
 * jsdom cannot calculate real color/geometry, but axe still catches semantic
 * regressions here: missing names, broken ARIA relationships, invalid roles,
 * and malformed form labels. Real color contrast stays in Playwright.
 */
export async function expectNoAxeViolations(context: ElementContext) {
  const results = await axe.run(context, {
    rules: { "color-contrast": { enabled: false } },
  });
  expect(
    results.violations.map((violation) => ({
      id: violation.id,
      targets: violation.nodes.map((node) => node.target.join(" ")),
    })),
  ).toEqual([]);
}
