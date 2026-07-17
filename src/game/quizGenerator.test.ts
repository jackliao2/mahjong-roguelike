import { describe, expect, it } from 'vitest';
import { tileKey } from './tiles';
import { generateQuestionForRound, generateSafeDiscard, generateYakuCombo } from './quizGenerator';

describe('quiz generator defense questions', () => {
  it('builds real safe-discard questions instead of falling back', () => {
    const question = generateSafeDiscard();

    expect(question.type).toBe('safe-discard');
    expect(question.hand).toHaveLength(14);
    expect(question.options).toHaveLength(4);
    expect(new Set(question.options.map(tileKey)).size).toBe(4);
    expect(question.correctIndices).toHaveLength(1);
    expect(question.prompt).toContain('guaranteed safe');
    expect(question.context).toContain("RIICHI PLAYER'S RIVER");
    const safeKey = tileKey(question.options[question.correctIndices[0]]);
    expect(question.explanation).toContain('genbutsu');
    expect(safeKey).toBeTruthy();
  });

  it('routes the final normal chapter into riichi defense', () => {
    for (const round of [10, 11, 12]) {
      const question = generateQuestionForRound(round, 12);

      expect(question.chapter).toBe('CH 4: RIICHI DEFENSE');
      expect(question.type).toBe('safe-discard');
      expect(question.hand).toHaveLength(14);
    }
  });
});

describe('quiz generator yaku questions', () => {
  it('labels semantic answers and never infers riichi from tiles alone', () => {
    const question = generateYakuCombo();

    expect(question.type).toBe('yaku-combo');
    expect(question.optionLabels).toHaveLength(4);
    expect(question.targetYaku).not.toBe('riichi');
    expect(question.explanation).toContain('not inferable');
  });
});
