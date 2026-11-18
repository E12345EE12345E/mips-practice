import { test, expect } from "@playwright/test";
test("challenge starts, skips, expires and preserves high score", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "MIPS Practice" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByText("300s")).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "MIPS answer" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Skip · −10s" }).click();
  await expect(page.getByText("INTENDED SOLUTION")).toBeVisible();
  const pausedTime = await page.locator("header strong").textContent();
  await page.clock.fastForward(20_000);
  await expect(page.getByText("INTENDED SOLUTION")).toBeVisible();
  await expect(page.locator("header strong")).toHaveText(pausedTime!);
  await page.getByRole("button", { name: "Continue →" }).click();
  await page.clock.fastForward(400);
  await expect(page.getByText("TRACE THE GOLD INSTRUCTIONS")).toBeVisible();
  await page.clock.fastForward(300_000);
  await expect(page.getByRole("button", { name: "Play Again" })).toBeVisible();
  await page.reload();
  await expect(page.getByText("High Score: 0")).toBeVisible();
});
test("endless mode has no clock, skips freely and saves only when ended", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(crypto, "getRandomValues", {
      value: (array: Uint32Array) => {
        array.set([0, 4, 9]);
        return array;
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Mode: 5 minutes/ }).click();
  await expect(page.getByRole("button", { name: /Mode: Endless/ })).toBeVisible();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("button", { name: "End Run" })).toBeVisible();
  await expect(page.getByText(/\d+s$/)).toHaveCount(0);
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await expect(page.getByText("INTENDED SOLUTION")).toBeVisible();
  await expect(page.getByRole("button", { name: "End Run" })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByText("INTENDED SOLUTION")).toBeVisible();
  await page.getByRole("button", { name: "Continue →" }).click();
  await expect(page.getByLabel("$t2", { exact: true })).toBeVisible();
  await page.getByLabel("$t2", { exact: true }).fill("15");
  await expect(page.getByText("Score: 1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "End Run" }).click();
  await expect(page.getByText("RUN COMPLETE")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("mips-practice:v2:endless:score:1"))).toBe("1");
  await page.getByRole("button", { name: "Play Again" }).click();
  await expect(page.getByRole("button", { name: "End Run" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /Mode: Endless/ })).toBeVisible();
});
test("Escape returns home without saving a score", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "MIPS answer" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Start", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("High Score:")).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("mips-practice:v2:score:1")),
  ).toBeNull();
});
test("translation reference shows the six supported syscall values", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const table = page.getByRole("complementary", { name: "Helpful syscalls" });
  await expect(table.getByRole("row")).toHaveCount(7);
  for (const [number, name] of [
    [1, "print_int"],
    [4, "print_string"],
    [5, "read_int"],
    [8, "read_string"],
    [11, "print_char"],
    [12, "read_char"],
  ] as const) {
    await expect(
      table.getByRole("row", { name: `${number} ${name}` }),
    ).toBeVisible();
  }
  await expect(page.getByText("scratch:")).toHaveCount(0);
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
