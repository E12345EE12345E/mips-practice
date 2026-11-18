import { expect, test } from "@playwright/test";
import { openApp } from "./helpers";

test("loads without console errors and shows the mandatory sentence", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await openApp(page);
  await page.getByRole("button", { name: "More details" }).click();
  await expect(page.getByTestId("no-error-checking")).toContainText(
    "No error checking is needed outside the stated specifications.",
  );
  await expect(page.getByTestId("submission-panel")).toContainText(/\d+ hidden test cases?\./);
  await expect(page.getByTestId("memory-table")).toBeVisible();
  expect(errors).toEqual([]);
});

test("each family loads", async ({ page }) => {
  await openApp(page);
  const options = await page.getByLabel("Exercise family").locator("option").allTextContents();
  expect(options.length).toBeGreaterThanOrEqual(6);
  for (const label of options.slice(1)) {
    await page.getByLabel("Exercise family").selectOption({ label });
    await page.getByRole("button", { name: "New problem" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(label);
    const more = page.getByRole("button", { name: "More details" });
    if (await more.isVisible()) await more.click();
    await expect(page.getByTestId("no-error-checking")).toBeVisible();
  }
});
