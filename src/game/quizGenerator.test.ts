import { describe, expect, it } from 'vitest';
import { tileKey } from './tiles';
import { generateContinuousTableTurn, generateQuestionForRound, generateSafeDiscard, generateTableDecision, generateUkeireChoice, generateYakuCombo, getAdaptiveQuestionType } from './quizGenerator';

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

describe('quiz generator efficiency questions', () => {
  it('builds a unique, computed ukeire comparison', () => {
    for (let sample = 0; sample < 20; sample++) {
      const question = generateUkeireChoice();

      expect(question.type).toBe('ukeire-choice');
      expect(question.hand).toHaveLength(14);
      expect(question.options).toHaveLength(4);
      expect(new Set(question.options.map(tileKey)).size).toBe(4);
      expect(question.correctIndices).toHaveLength(1);
      expect(question.explanation).toContain('live tiles');
      expect(question.explanation).toContain('→');
    }
  });

  it('introduces ukeire in round 7 of a normal run', () => {
    expect(generateQuestionForRound(7, 12).type).toBe('ukeire-choice');
  });
});

describe('continuous table turns', () => {
  it('carries the post-discard hand and rivers into the next draw', () => {
    const first = generateContinuousTableTurn(null, 1);
    const discard = first.options[first.correctIndices[0]];
    const hand13 = [...first.hand];
    const discardIndex = hand13.findIndex(tile => tile.id === discard.id);
    hand13.splice(discardIndex, 1);

    const second = generateContinuousTableTurn(hand13, 2, ['man-1'], ['wind-1']);
    const originalIds = new Set(hand13.map(tile => tile.id));
    const carriedIds = second.hand.filter(tile => originalIds.has(tile.id));

    expect(first.tableTurn).toBe(1);
    expect(second.tableTurn).toBe(2);
    expect(second.hand).toHaveLength(14);
    expect(carriedIds).toHaveLength(13);
    expect(second.playerRiver).toEqual(['man-1']);
    expect(second.opponentRiver).toEqual(['wind-1']);
    expect(second.correctIndices).toHaveLength(1);
    expect(second.prompt).toContain('Turn 2');
  });
});

describe('quiz generator table decisions', () => {
  it('provides readable riichi, dama, push or fold choices', () => {
    for (let sample = 0; sample < 12; sample++) {
      const question = generateTableDecision();
      expect(question.type).toBe('table-decision');
      expect(question.hand).toHaveLength(0);
      expect(question.options).toHaveLength(3);
      expect(question.optionLabels).toHaveLength(3);
      expect(question.correctIndices).toHaveLength(1);
      expect(question.context).toMatch(/TURN|SHANTEN/);
      expect(question.explanation.length).toBeGreaterThan(80);
    }
  });

  it('uses a table decision for the third normal boss', () => {
    expect(generateQuestionForRound(9, 12).type).toBe('table-decision');
  });
});

describe('adaptive difficulty', () => {
  it('raises difficulty after a three-answer combo', () => {
    expect(getAdaptiveQuestionType(3, 0, 5, false)).toBe('ukeire-choice');
    expect(getAdaptiveQuestionType(4, 0, 6, false)).toBe('table-decision');
  });

  it('offers recovery after repeated misses without overriding bosses', () => {
    expect(getAdaptiveQuestionType(0, 2, 5, false)).toBe('tenpai-win');
    expect(getAdaptiveQuestionType(0, 2, 6, true)).toBeUndefined();
    expect(getAdaptiveQuestionType(5, 0, 2, false)).toBeUndefined();
  });
});
