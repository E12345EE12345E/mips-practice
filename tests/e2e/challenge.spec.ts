import { test, expect } from "@playwright/test";
test("challenge starts, skips, expires and preserves high score", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "MIPS Practice" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "MIPS answer" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Skip · −10s" }).click();
  await expect(page.getByText("TRACE THE GOLD INSTRUCTIONS")).toBeVisible();
  for (let i = 0; i < 11; i++)
    await page.getByRole("button", { name: "Skip · −10s" }).click();
  await expect(page.getByRole("button", { name: "Play Again" })).toBeVisible();
  await page.reload();
  await expect(page.getByText("High Score: 0")).toBeVisible();
});
test("legacy direct route remains available", async ({ page }) => {
  await page.goto("/v1");
  await expect(page.getByLabel("Exercise family")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Check solution" }),
  ).toBeVisible();
});
test("matching assembly and tracing answers advance automatically", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(crypto, "getRandomValues", {
      value: (array: Uint32Array) => {
        array.set([0, 4, 9]);
        return array;
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page
    .getByRole("textbox", { name: "MIPS answer" })
    .fill(
      "li $t0, 5\nli $t1, 10\nli $t2, 3\nmul $t0, $t0, $t2\nadd $t0, $t1, $t0",
    );
  await expect(page.getByText("Score: 1", { exact: true })).toBeVisible();
  await expect(page.getByLabel("$t2", { exact: true })).toBeVisible();
  await page.getByLabel("$t2", { exact: true }).fill("15");
  await expect(page.getByText("Score: 2", { exact: true })).toBeVisible();
});
