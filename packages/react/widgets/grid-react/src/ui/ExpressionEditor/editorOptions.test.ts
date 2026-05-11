import { describe, expect, it } from 'vitest';
import { createExpressionEditorOptions } from './editorOptions';

describe('ExpressionEditor Monaco options', () => {
  it('keeps popup suggestion acceptance and caret visibility inside Monaco', () => {
    const doc = document.implementation.createHTMLDocument('popout');
    const options = createExpressionEditorOptions({
      value: '[status] == "FILLED"',
      multiline: true,
      fontSize: 12,
      readOnly: false,
      document: doc,
    });

    expect(options.cursorBlinking).toBe('blink');
    expect(options.acceptSuggestionOnEnter).toBe('on');
    expect(options.tabCompletion).toBe('on');
    expect(options.tabFocusMode).toBe(false);
    expect(options.renderWhitespace).toBe('none');
  });
});
