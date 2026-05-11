import { test, expect, type Page } from '@playwright/test';
import {
  bootCleanDemo,
  openPanel,
} from './helpers/settingsSheet';

type EditorHost = Page;

const expressionEditor = (page: EditorHost) =>
  page.locator('[data-testid^="cs-rule-expression-"]').first();

async function ensureExpressionEditor(page: EditorHost) {
  if (await expressionEditor(page).isVisible().catch(() => false)) return;
  await page.locator('[data-testid="cs-add-rule-btn"]').click();
  await expect(expressionEditor(page)).toBeVisible();
}

async function openInlineExpressionEditor(page: Page): Promise<EditorHost> {
  await bootCleanDemo(page);
  await openPanel(page, 'conditional-styling');
  await ensureExpressionEditor(page);
  return page;
}

async function openPoppedExpressionEditor(page: Page): Promise<EditorHost> {
  await bootCleanDemo(page);
  await page.locator('[data-testid="v2-settings-open-btn"]').click();
  const popupPromise = page.waitForEvent('popup');
  await page.locator('[data-testid="v2-settings-popout-btn"]').click();
  const popup = await popupPromise;
  await popup.waitForSelector('[data-testid="v2-settings-sheet"]', { timeout: 5_000 });
  await popup.locator('[data-testid="v2-settings-module-dropdown"]').click();
  await popup.locator('[data-testid="v2-settings-nav-menu-conditional-styling"]').click();
  await ensureExpressionEditor(popup);
  return popup;
}

async function editorState(page: EditorHost) {
  return page.evaluate(() => {
    const textarea = document.querySelector<HTMLTextAreaElement>('textarea.inputarea');
    const cursors = Array.from(document.querySelectorAll<HTMLElement>('.cursor'));
    const cursor = cursors.find((node) => getComputedStyle(node).visibility === 'visible') ?? cursors[0];
    return {
      activeTag: document.activeElement?.tagName ?? null,
      activeClass: String((document.activeElement as HTMLElement | null)?.className ?? ''),
      cursorLeft: cursor?.style.left ?? null,
      cursorVisibility: cursor ? getComputedStyle(cursor).visibility : null,
      cursorAnimation: cursor ? getComputedStyle(cursor).animationName : null,
      visibleCursorCount: cursors.filter((node) => getComputedStyle(node).visibility === 'visible').length,
      text: document.querySelector('.view-lines')?.textContent ?? '',
      textareaValue: textarea?.value ?? '',
      textareaSelectionStart: textarea?.selectionStart ?? null,
      textareaSelectionEnd: textarea?.selectionEnd ?? null,
      selectedTextBlocks: document.querySelectorAll('.selected-text').length,
      whitespaceGlyphs: document.querySelectorAll('.mtk-whitespace').length,
      indentGuides: document.querySelectorAll(
        '.core-guide, .core-guide-indent, .core-guide-active-indent, [class*="indent-guide"], [class*="indentGuide"]',
      ).length,
      overflowHosts: document.querySelectorAll('[data-ds-monaco-overflow]').length,
      visibleSuggestions: Array.from(document.querySelectorAll<HTMLElement>('.suggest-widget'))
        .filter((widget) => {
          const style = getComputedStyle(widget);
          return style.display !== 'none'
            && style.visibility !== 'hidden'
            && widget.querySelector('.monaco-list-row') !== null;
        }).length,
    };
  });
}

async function focusExpressionAtEnd(page: EditorHost) {
  await expressionEditor(page).click({ force: true });
  await page.waitForSelector('textarea.inputarea', { timeout: 5_000 });
  await page.locator('textarea.inputarea').first().click({ force: true });
  await page.evaluate(() => document.querySelector<HTMLTextAreaElement>('textarea.inputarea')?.focus());
  await page.waitForFunction(() => document.activeElement?.tagName === 'TEXTAREA');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End');
  await page.keyboard.press('End');
  await page.waitForTimeout(80);
}

async function assertEditorReceivesSpaceAtVisibleCursor(page: EditorHost) {
  await focusExpressionAtEnd(page);
  const before = await editorState(page);
  await page.keyboard.press('Space');
  await page.waitForTimeout(120);
  const after = await editorState(page);

  expect(after.activeTag).toBe('TEXTAREA');
  expect(after.textareaValue.length).toBe(before.textareaValue.length + 1);
  expect(after.whitespaceGlyphs).toBe(0);
}

async function assertSpacesBeforeTextDoNotRenderWhitespaceBars(page: EditorHost) {
  await focusExpressionAtEnd(page);
  await page.keyboard.type('xyx');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  await expect.poll(async () => (await editorState(page)).textareaValue).toContain('   xyx');
  const after = await editorState(page);
  expect(after.whitespaceGlyphs).toBe(0);
  expect(after.indentGuides).toBe(0);
  expect(after.visibleCursorCount).toBe(1);
}

async function assertArrowKeysMoveVisibleCursor(page: EditorHost) {
  await focusExpressionAtEnd(page);
  const before = (await editorState(page)).textareaValue;
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.type('X');
  await expect.poll(async () => (await editorState(page)).textareaValue).not.toBe(`${before}X`);
  expect((await editorState(page)).textareaValue).toContain('X');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('End');
}

async function assertTabAcceptsColumnWithoutLeavingEditor(page: EditorHost) {
  await focusExpressionAtEnd(page);
  const before = await editorState(page);
  await page.keyboard.type('[');
  await page.waitForTimeout(120);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(120);
  const after = await editorState(page);

  expect(after.activeTag).toBe('TEXTAREA');
  expect(after.textareaValue).not.toBe(before.textareaValue);
  expect(after.textareaValue).toMatch(/\[[^\]]+\]\]?$/);
}

async function assertTabDoesNotInsertColumnWithoutCompletionPrefix(page: EditorHost) {
  await focusExpressionAtEnd(page);
  const before = await editorState(page);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(120);
  const after = await editorState(page);

  expect(after.activeTag).toBe('TEXTAREA');
  expect(after.textareaValue.startsWith(before.textareaValue)).toBe(true);
  expect(after.textareaValue).not.toMatch(/\[positionId\]\s*$/);
}

async function assertTabAcceptsTypedFunctionSuggestion(page: EditorHost) {
  await focusExpressionAtEnd(page);
  await page.keyboard.type('SU');
  await page.keyboard.press('Control+Space');
  await expect.poll(async () => (await editorState(page)).visibleSuggestions, {
    timeout: 2_000,
  }).toBeGreaterThanOrEqual(1);
  await page.keyboard.press('Tab');
  await expect.poll(async () => (await editorState(page)).textareaValue).toMatch(/SU[A-Z]*\(/);
}

async function assertBackspaceEditsTextAndDeletesSelection(page: EditorHost) {
  await focusExpressionAtEnd(page);
  await page.keyboard.type('abc');
  await expect.poll(async () => (await editorState(page)).textareaValue).toContain('abc');
  const afterType = (await editorState(page)).textareaValue;
  const before = afterType.replace(/abc\n?$/, '');

  await page.keyboard.press('Backspace');
  await expect.poll(async () => (await editorState(page)).textareaValue).toMatch(/ab\n?$/);
  const beforeSelectionDelete = (await editorState(page)).textareaValue;

  await page.keyboard.type('c');
  await page.keyboard.press('Shift+ArrowLeft');
  await expect.poll(async () => (await editorState(page)).selectedTextBlocks).toBeGreaterThanOrEqual(1);
  await page.keyboard.press('Backspace');
  await expect.poll(async () => (await editorState(page)).textareaValue).toBe(beforeSelectionDelete);
}

async function assertDeleteKeyEditsText(page: EditorHost) {
  await focusExpressionAtEnd(page);
  await page.keyboard.type('ab');
  await expect.poll(async () => (await editorState(page)).textareaValue).toContain('ab');
  const afterType = (await editorState(page)).textareaValue;
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await editorState(page)).textareaValue.length).toBeLessThan(afterType.length);
}

async function assertEnterInsertsNewlineLikeStockMonaco(page: EditorHost) {
  await focusExpressionAtEnd(page);
  const before = (await editorState(page)).textareaValue;
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await editorState(page)).textareaValue).toBe(`${before}\n`);
}

async function assertSuggestionArrowsStayInSuggestionMode(page: EditorHost) {
  await focusExpressionAtEnd(page);
  await page.keyboard.type('[');
  await expect.poll(async () => (await editorState(page)).visibleSuggestions, {
    timeout: 2_000,
  }).toBeGreaterThanOrEqual(1);
  const before = await editorState(page);

  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(80);
  const withSuggestion = await editorState(page);

  expect(withSuggestion.activeTag).toBe('TEXTAREA');
  expect(withSuggestion.textareaValue).toBe(before.textareaValue);
  expect(withSuggestion.visibleSuggestions).toBeGreaterThanOrEqual(1);
  await page.keyboard.press('Escape');
}

async function assertControlSpaceTriggersSuggestions(page: EditorHost) {
  await focusExpressionAtEnd(page);
  await page.keyboard.press('Control+Space');
  await expect.poll(async () => (await editorState(page)).visibleSuggestions, {
    timeout: 2_000,
  }).toBeGreaterThanOrEqual(1);
  expect((await editorState(page)).activeTag).toBe('TEXTAREA');
}

async function assertCaretIsVisibleAndBlinking(page: EditorHost) {
  await focusExpressionAtEnd(page);
  const state = await editorState(page);

  expect(state.activeTag).toBe('TEXTAREA');
  expect(state.visibleCursorCount).toBeGreaterThanOrEqual(1);
  expect(state.cursorVisibility).toBe('visible');
  expect(state.cursorAnimation).toBe('ds-expression-caret-blink');
}

test.describe('v2 — expression editor keyboard behaviour', () => {
  test('inline dialog editor keeps Monaco-style text input and suggestions usable', async ({ page }) => {
    const editorPage = await openInlineExpressionEditor(page);

    await assertCaretIsVisibleAndBlinking(editorPage);
    await assertEditorReceivesSpaceAtVisibleCursor(editorPage);
    await assertSpacesBeforeTextDoNotRenderWhitespaceBars(editorPage);
    await assertArrowKeysMoveVisibleCursor(editorPage);
    await assertTabDoesNotInsertColumnWithoutCompletionPrefix(editorPage);
    await assertTabAcceptsTypedFunctionSuggestion(editorPage);
    await assertTabAcceptsColumnWithoutLeavingEditor(editorPage);
    await assertEnterInsertsNewlineLikeStockMonaco(editorPage);
    await assertControlSpaceTriggersSuggestions(editorPage);
    await assertBackspaceEditsTextAndDeletesSelection(editorPage);
    await assertDeleteKeyEditsText(editorPage);
    await assertSuggestionArrowsStayInSuggestionMode(editorPage);
  });

  test('popped-out editor keeps Monaco DOM, caret, and keyboard handling in the popout window', async ({ page }) => {
    const popup = await openPoppedExpressionEditor(page);

    await assertCaretIsVisibleAndBlinking(popup);
    await assertEditorReceivesSpaceAtVisibleCursor(popup);
    await assertSpacesBeforeTextDoNotRenderWhitespaceBars(popup);
    await assertArrowKeysMoveVisibleCursor(popup);
    await assertTabDoesNotInsertColumnWithoutCompletionPrefix(popup);
    await assertTabAcceptsTypedFunctionSuggestion(popup);
    await assertTabAcceptsColumnWithoutLeavingEditor(popup);
    await assertEnterInsertsNewlineLikeStockMonaco(popup);
    await assertControlSpaceTriggersSuggestions(popup);
    await assertBackspaceEditsTextAndDeletesSelection(popup);
    await assertDeleteKeyEditsText(popup);
    await assertSuggestionArrowsStayInSuggestionMode(popup);

    const mainDocHosts = await page.locator('[data-ds-monaco-overflow]').count();
    const popupState = await editorState(popup);
    expect(mainDocHosts).toBe(0);
    expect(popupState.overflowHosts).toBeGreaterThanOrEqual(1);
  });
});
