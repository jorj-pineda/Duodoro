import { expect, test, type Page } from "@playwright/test";

function collectBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

async function openLanding(page: Page) {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(
    page.getByRole("heading", { name: "Focus together" }),
  ).toBeVisible();
}

test("production landing surface is usable and crawler-ready", async ({
  page,
  request,
}) => {
  const browserErrors = collectBrowserErrors(page);
  const serverHealth = await request.get("http://127.0.0.1:3001/health");
  expect(serverHealth.ok()).toBe(true);
  await expect(serverHealth.json()).resolves.toEqual({ ok: true });
  await openLanding(page);

  await expect(page).toHaveTitle(
    "Duodoro — Focus together, anywhere.",
  );
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue with Discord" }),
  ).toBeVisible();

  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
    "content",
    "https://duodoro.live",
  );
  const ogImage = await page
    .locator('meta[property="og:image"]')
    .getAttribute("content");
  expect(ogImage).toMatch(/^https:\/\/duodoro\.live\//);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    "content",
    "summary_large_image",
  );

  expect(
    await page.locator(
      "[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay",
    ).count(),
  ).toBe(0);
  expect(browserErrors).toEqual([]);
});

for (const [name, viewport] of [
  ["phone portrait", { width: 390, height: 844 }],
  ["phone landscape", { width: 844, height: 390 }],
] as const) {
  test(`${name} keeps the sign-in path inside the viewport`, async ({ page }) => {
    const browserErrors = collectBrowserErrors(page);
    await page.setViewportSize(viewport);
    await openLanding(page);

    const layout = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);

    for (const label of ["Continue with Google", "Continue with Discord"]) {
      const box = await page.getByRole("button", { name: label }).boundingBox();
      expect(box, `${label} should have a rendered box`).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    }

    expect(browserErrors).toEqual([]);
  });
}
