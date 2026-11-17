import { expect, test } from "@playwright/test";
import { bufferSize, echoProgram, openApp, setEditorText } from "./helpers";

test("typing a valid program updates the preview, and an invalid edit keeps the last good one", async ({ page }) => {
  await openApp(page, "Bounded string echo");
  const n = await bufferSize(page);

  await page.getByLabel("Sample input (stdin)").fill("hello");
  await setEditorText(page, echoProgram(n));

  await expect(page.getByTestId("preview-stdout")).toHaveText("hello");
  await expect(page.getByTestId("preview-status")).toContainText("OK");

  // Break the program: diagnostics appear, but the last valid preview remains.
  await setEditorText(page, "main:\n  frobnicate $t0\n");
  await expect(page.getByTestId("diagnostics").getByRole("listitem").first()).toBeVisible();
  await expect(page.getByTestId("preview-stdout")).toHaveText("hello");
  await expect(page.getByTestId("stale-banner")).toBeVisible();

  // Fixing it clears the diagnostics and the stale banner.
  await setEditorText(page, echoProgram(n));
  await expect(page.getByTestId("stale-banner")).toHaveCount(0);
  await expect(page.getByTestId("preview-stdout")).toHaveText("hello");
});

test("editor shows error markers for a bad program", async ({ page }) => {
  await openApp(page);
  await setEditorText(page, "main:\n  addi $t0, $t0\n");
  await expect(page.locator(".monaco-editor .squiggly-error").first()).toBeVisible();
});

test("changing the sample input re-runs the preview", async ({ page }) => {
  await openApp(page, "Bounded string echo");
  const n = await bufferSize(page);
  await setEditorText(page, echoProgram(n));
  const input = page.getByLabel("Sample input (stdin)");
  await input.fill("abc");
  await expect(page.getByTestId("preview-stdout")).toHaveText("abc");
  await input.fill("xyz");
  await expect(page.getByTestId("preview-stdout")).toHaveText("xyz");
});

test("new problem resets the editor to the starter for that problem", async ({ page }) => {
  await openApp(page, "Literal arithmetic");
  await setEditorText(page, "main:\n  li $v0, 10\n  syscall\n# marker-comment\n");
  await expect(page.getByTestId("assembly-editor")).toContainText("marker-comment");
  await page.getByLabel("Exercise family").selectOption({ label: "Toggle the case of one character" });
  await page.getByRole("button", { name: "New problem" }).click();
  await expect(page.getByTestId("assembly-editor")).not.toContainText("marker-comment");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Toggle the case of one character");
});
