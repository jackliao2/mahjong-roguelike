// Privacy-friendly analytics wrapper for Umami.
// Umami exposes window.umami.track(eventName, props) once the script loads.
// If the script is blocked or not loaded, calls are silently no-ops.

type UmamiWindow = Window & { umami?: { track: (name: string, props?: Record<string, unknown>) => void } };

/**
 * Track a custom analytics event. Silently no-ops if Umami is not loaded
 * (e.g., blocked by ad blocker or script failed to load).
 */
export function trackEvent(name: string, props?: Record<string, unknown>): void {
  try {
    const w = window as UmamiWindow;
    if (w.umami && typeof w.umami.track === 'function') {
      w.umami.track(name, props);
    }
  } catch {
    // Silently ignore — analytics should never break the game
  }
}

// ===== Predefined event trackers for key game moments =====

export function trackRunStart(deckId: string): void {
  trackEvent('run_start', { deck: deckId });
}

export function trackRoundComplete(round: number, score: number, survived: boolean): void {
  trackEvent('round_complete', { round, score, survived });
}

export function trackRunComplete(won: boolean, score: number, rounds: number): void {
  trackEvent('run_complete', { won, score, rounds });
}

export function trackWin(yakuList: string[], han: number, score: number, isRiichi: boolean): void {
  trackEvent('win', {
    yaku: yakuList,
    han,
    score,
    riichi: isRiichi,
  });
}
