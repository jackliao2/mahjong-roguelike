import Phaser from 'phaser';

// Procedural sound effects using Web Audio API (no external assets needed)
export class SoundManager {
  private scene: Phaser.Scene;
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  private getContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return this.ctx;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  // Simple tone beep
  private playTone(frequency: number, duration: number, type: OscillatorType = 'square', volume: number = 0.1): void {
    if (!this.enabled) return;
    try {
      const ctx = this.getContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      // Audio not supported, silently fail
    }
  }

  // Sound: drawing a tile
  playDraw(): void {
    this.playTone(400, 0.08, 'square', 0.08);
  }

  // Sound: discarding a tile
  playDiscard(): void {
    this.playTone(300, 0.06, 'square', 0.06);
  }

  // Sound: winning hand (ascending arpeggio)
  playWin(): void {
    const notes = [523, 659, 784, 1047]; // C, E, G, C
    notes.forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 0.15, 'triangle', 0.12), i * 80);
    });
  }

  // Sound: riichi declaration (mysterious chime)
  playRiichi(): void {
    this.playTone(660, 0.1, 'sine', 0.1);
    setTimeout(() => this.playTone(880, 0.15, 'sine', 0.1), 100);
  }

  // Sound: reward selection (sparkle)
  playReward(): void {
    const notes = [784, 988, 1319]; // G, B, E
    notes.forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 0.12, 'triangle', 0.1), i * 60);
    });
  }

  // Sound: game over (descending)
  playGameOver(): void {
    const notes = [440, 370, 311, 262]; // A, F#, D#, C
    notes.forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 0.2, 'sawtooth', 0.08), i * 150);
    });
  }

  // Sound: button click
  playClick(): void {
    this.playTone(600, 0.04, 'square', 0.05);
  }

  // Sound: tenpai detected (gentle bell)
  playTenpai(): void {
    this.playTone(880, 0.2, 'sine', 0.08);
    setTimeout(() => this.playTone(1100, 0.15, 'sine', 0.06), 100);
  }
}
