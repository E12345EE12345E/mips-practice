import { expect, type Page } from "@playwright/test";

/** Replace the whole editor document with `source`. */
export async function setEditorText(page: Page, source: string): Promise<void> {
  const editor = page.getByTestId("assembly-editor");
  await editor.locator(".monaco-editor .view-lines").first().click();
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Delete");
  await page.keyboard.insertText(source);
}

export async function openApp(page: Page, family?: string): Promise<void> {
  await page.goto("/v1/");
  await expect(page.getByTestId("c-snippet")).toBeVisible();
  await expect(page.locator(".monaco-editor").first()).toBeVisible();
  if (family) {
    await page.getByLabel("Exercise family").selectOption({ label: family });
    await page.getByRole("button", { name: "New problem" }).click();
  }
}

export async function bufferSize(page: Page): Promise<number> {
  const text = await page.getByTestId("c-snippet").innerText();
  const m = /char text\[(\d+)\]/.exec(text);
  if (!m) throw new Error(`no buffer declaration in:\n${text}`);
  return Number(m[1]);
}

export function echoProgram(n: number): string {
  return [
    ".data",
    `text: .space ${n}`,
    ".text",
    "main:",
    "la $a0, text",
    `li $a1, ${n}`,
    "li $v0, 8",
    "syscall",
    "la $a0, text",
    "li $v0, 4",
    "syscall",
    "li $v0, 10",
    "syscall",
    "",
  ].join("\n");
}
