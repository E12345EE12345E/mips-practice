import { expect, test } from "@playwright/test";
import { echoProgram, openApp, setEditorText } from "./helpers";

test("desktop layout: left column about 42%, editor on the right", async ({ page }) => {
  await openApp(page);
  const prompt = await page.getByRole("region", { name: "Memory and registers" }).boundingBox();
  const editor = await page.getByRole("region", { name: "Assembly editor" }).boundingBox();
  const problem = await page.locator(".problem-panel").boundingBox();
  expect(prompt && editor && problem).toBeTruthy();
  const total = 1440;
  const leftFraction = problem!.width / total;
  expect(leftFraction).toBeGreaterThan(0.35);
  expect(leftFraction).toBeLessThan(0.5);
  expect(editor!.x).toBeGreaterThan(problem!.x + problem!.width - 2);
  expect(problem!.y).toBeLessThan(prompt!.y);
});

test("dividers resize with the keyboard", async ({ page }) => {
  await openApp(page);
  const separators = page.getByRole("separator");
  expect(await separators.count()).toBeGreaterThanOrEqual(2);
  const first = separators.first();
  const before = await page.locator(".problem-panel").boundingBox();
  await first.focus();
  const key = (await first.getAttribute("aria-orientation")) === "horizontal" ? "ArrowDown" : "ArrowRight";
  for (let i = 0; i < 5; i++) await page.keyboard.press(key);
  const after = await page.locator(".problem-panel").boundingBox();
  expect(after!.width !== before!.width || after!.height !== before!.height).toBe(true);
});

test("narrow screens switch to tabs", async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 900 });
  await page.goto("/");
  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveCount(3);
  await expect(page.getByTestId("c-snippet")).toBeVisible();
  await page.getByRole("tab", { name: "Editor" }).click();
  await expect(page.getByTestId("assembly-editor")).toBeVisible();
  await page.getByRole("tab", { name: /Memory/ }).click();
  await expect(page.getByTestId("preview-controls")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
});

test("memory table view and number format are keyboard operable", async ({ page }) => {
  await openApp(page, "Bounded string echo");
  await page.getByRole("button", { name: "Table" }).click();
  await expect(page.getByRole("button", { name: "Table" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Hex" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Hex" })).toHaveAttribute("aria-pressed", "true");
});

test("graph nodes can be dragged and pointers are drawn", async ({ page }) => {
  await openApp(page, "Bounded string echo");
  await setEditorText(page, echoProgram(20));
  await page.getByLabel("Sample input (stdin)").fill("hi");
  await page.getByRole("button", { name: "Final state" }).click();
  const graph = page.getByTestId("memory-map");
  await expect(graph.locator(".react-flow__node").first()).toBeVisible();
  await expect(graph.locator(".react-flow__edge").first()).toBeAttached();

  const node = graph.locator(".react-flow__node").filter({ hasText: "Memory: text" }).first();
  const target = (await node.count()) ? node : graph.locator(".react-flow__node").nth(1);
  const handle = target.locator(".card-title, header, .map-node").first();
  const box = await handle.boundingBox();
  const before = await target.boundingBox();
  await page.mouse.move(box!.x + 8, box!.y + 6);
  await page.mouse.down();
  await page.mouse.move(box!.x + 60, box!.y + 40, { steps: 6 });
  await page.mouse.up();
  const after = await target.boundingBox();
  expect(Math.abs(after!.x - before!.x) + Math.abs(after!.y - before!.y)).toBeGreaterThan(10);
});
