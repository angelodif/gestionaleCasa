import { Injectable } from '@angular/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

export interface TimerState {
  label: string;
  totalSecs: number;
  remaining: number;
  running: boolean;
}

@Injectable({ providedIn: 'root' })
export class PizzaTimerService {

  // ── Stopwatch ──────────────────────────────────────────
  stopwatchRunning = false;
  stopwatchSeconds = 0;
  private stopwatchInterval: any = null;

  soundEnabled = true;

  // ── Countdown Timers ───────────────────────────────────
  timer4h: TimerState = { label: '4 ore (Lievitazione)', totalSecs: 4 * 3600, remaining: 4 * 3600, running: false };
  timer2h: TimerState = { label: '2 ore (Panetti)',       totalSecs: 2 * 3600, remaining: 2 * 3600, running: false };

  private timer4hInterval: any = null;
  private timer2hInterval: any = null;

  // ── Stopwatch ──────────────────────────────────────────
  toggleStopwatch() {
    if (this.stopwatchRunning) {
      clearInterval(this.stopwatchInterval);
      this.stopwatchRunning = false;
    } else {
      this.stopwatchRunning = true;
      this.stopwatchInterval = setInterval(() => this.stopwatchSeconds++, 1000);
    }
  }

  resetStopwatch() {
    clearInterval(this.stopwatchInterval);
    this.stopwatchRunning = false;
    this.stopwatchSeconds = 0;
  }

  // ── Countdown ──────────────────────────────────────────
  startTimer(which: '4h' | '2h') {
    const t = which === '4h' ? this.timer4h : this.timer2h;
    if (t.running || t.remaining === 0) return;
    t.running = true;

    const interval = setInterval(() => {
      if (t.remaining > 0) {
        t.remaining--;
      } else {
        clearInterval(interval);
        t.running = false;
        if (which === '4h') this.timer4hInterval = null;
        else this.timer2hInterval = null;
        this.sendNotification(t.label);
      }
    }, 1000);

    if (which === '4h') {
      this.timer4hInterval = interval;
      this.scheduleNativeNotification(t.label, t.remaining, 4);
    } else {
      this.timer2hInterval = interval;
      this.scheduleNativeNotification(t.label, t.remaining, 2);
    }
  }

  private async scheduleNativeNotification(label: string, seconds: number, id: number) {
    if (Capacitor.isNativePlatform()) {
      await LocalNotifications.schedule({
        notifications: [
          {
            title: '⏰ Timer Pizza!',
            body: `Il timer "${label}" è scaduto!`,
            id: id,
            schedule: { at: new Date(Date.now() + seconds * 1000) },
            sound: 'beep.wav',
            actionTypeId: '',
            extra: null
          }
        ]
      });
    }
  }

  private async cancelNativeNotification(id: number) {
    if (Capacitor.isNativePlatform()) {
      await LocalNotifications.cancel({ notifications: [{ id }] });
    }
  }

  pauseTimer(which: '4h' | '2h') {
    const t = which === '4h' ? this.timer4h : this.timer2h;
    const interval = which === '4h' ? this.timer4hInterval : this.timer2hInterval;
    clearInterval(interval);
    t.running = false;
    this.cancelNativeNotification(which === '4h' ? 4 : 2);
  }

  resetTimer(which: '4h' | '2h') {
    const t = which === '4h' ? this.timer4h : this.timer2h;
    const interval = which === '4h' ? this.timer4hInterval : this.timer2hInterval;
    clearInterval(interval);
    t.running = false;
    t.remaining = t.totalSecs;
    this.cancelNativeNotification(which === '4h' ? 4 : 2);
  }

  // ── Helpers ────────────────────────────────────────────
  get anyActive(): boolean {
    return this.stopwatchRunning || this.timer4h.running || this.timer2h.running || this.isFinished;
  }

  get isFinished(): boolean {
    // Il badge rimane attivo per un po' se un timer è a zero e non resettato
    return (this.timer4h.remaining === 0 && !this.timer4h.running && this.timer4h.totalSecs > 0) ||
           (this.timer2h.remaining === 0 && !this.timer2h.running && this.timer2h.totalSecs > 0);
  }

  get timeLeft(): string {
    if (this.timer4h.running) return this.formatTime(this.timer4h.remaining);
    if (this.timer2h.running) return this.formatTime(this.timer2h.remaining);
    if (this.stopwatchRunning) return this.formatTime(this.stopwatchSeconds);
    return '';
  }

  formatTime(secs: number): string {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
  }

  timerPercent(t: TimerState): number {
    return ((t.totalSecs - t.remaining) / t.totalSecs) * 100;
  }

  // ── Notifications ──────────────────────────────────────
  async requestPermission() {
    if (Capacitor.isNativePlatform()) {
      const perm = await LocalNotifications.requestPermissions();
      if (perm.display !== 'granted') {
        console.warn('Permessi notifiche non concessi');
      }
    }
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  }

  private sendNotification(label: string) {
    this.playAlarmSound();
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('⏰ Timer Pizza!', {
        body: `Il timer "${label}" è scaduto!`,
        icon: '/assets/images/pizza.jpeg'
      });
    } else {
      alert(`⏰ Timer scaduto: ${label}!`);
    }
  }

  playAlarmSound() {
    if (!this.soundEnabled) return;
    try {
      const ctx = new AudioContext();
      const beep = (start: number, freq: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.6, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + duration + 0.05);
      };
      // 5 beep in sequenza: 880Hz per 0.2s con pausa 0.15s
      for (let i = 0; i < 5; i++) {
        beep(i * 0.38, 880, 0.22);
      }
      // Beep finale più lungo
      beep(5 * 0.38, 1100, 0.5);
    } catch (error: any) {
      console.warn('Audio non supportato', error);
    }
  }

}
