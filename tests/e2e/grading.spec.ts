import { expect, test } from "@playwright/test";
import { bufferSize, echoProgram, openApp, setEditorText } from "./helpers";

test("a correct solution passes every hidden case", async ({ page }) => {
  await openApp(page, "Bounded string echo");
  const n = await bufferSize(page);
  await setEditorText(page, echoProgram(n));
  await page.getByRole("button", { name: "Check solution" }).click();
  await expect(page.getByTestId("grade-summary")).toHaveText("3/3 cases passed");
});

test("an incorrect solution fails with a category but never shows hidden values", async ({ page }) => {
  await openApp(page, "Bounded string echo");
  await setEditorText(page, ".text\nmain:\n  li $v0, 10\n  syscall\n");
  await page.getByRole("button", { name: "Check solution" }).click();
  await expect(page.getByTestId("grade-summary")).toHaveText("0/3 cases passed");
  await expect(page.getByTestId("grade-result")).toContainText("output mismatch");
  // The result must be a bounded summary: no expected/actual output, no input.
  const text = (await page.getByTestId("grade-result").innerText()).toLowerCase();
  expect(text).not.toContain("expected");
  expect(text).not.toContain("stdin");
});

test("buffer overflow is reported as a category", async ({ page }) => {
  await openApp(page, "Bounded string echo");
  const n = await bufferSize(page);
  await setEditorText(
    page,
    `.data\ntext: .space 4\n.text\nmain:\n  la $a0, text\n  li $a1, ${n}\n  li $v0, 8\n  syscall\n  li $v0, 10\n  syscall\n`,
  );
  await page.getByRole("button", { name: "Check solution" }).click();
  await expect(page.getByTestId("grade-summary")).not.toHaveText(/^3\/3/);
  await expect(page.getByTestId("grade-result")).toContainText(/buffer overflow/i);
});

test("editing after a check marks the result stale", async ({ page }) => {
  await openApp(page, "Bounded string echo");
  const n = await bufferSize(page);
  await setEditorText(page, echoProgram(n));
  await page.getByRole("button", { name: "Check solution" }).click();
  await expect(page.getByTestId("grade-summary")).toBeVisible();
  await setEditorText(page, echoProgram(n) + "# changed\n");
  await expect(page.getByTestId("grade-stale")).toBeVisible();
});

test("persisted state never contains hidden values", async ({ page }) => {
  await openApp(page, "Bounded string echo");
  const n = await bufferSize(page);
  await setEditorText(page, echoProgram(n));
  await page.getByRole("button", { name: "Check solution" }).click();
  await expect(page.getByTestId("grade-summary")).toBeVisible();
  await page.waitForTimeout(800);
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(stored).toContain("mips-practice:session");
  expect(stored.toLowerCase()).not.toMatch(/hidden|seed|trace|expected/);
});

test("reload restores the draft", async ({ page }) => {
  await openApp(page, "Bounded string echo");
  const n = await bufferSize(page);
  await setEditorText(page, echoProgram(n) + "# persisted-marker\n");
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.getByTestId("assembly-editor")).toContainText("persisted-marker");
  await expect(page.getByTestId("c-snippet")).toContainText(`char text[${n}]`);
});
