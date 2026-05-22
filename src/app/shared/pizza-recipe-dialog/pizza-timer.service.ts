import { Injectable } from '@angular/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

export interface TimerState {
  label: string;
  totalSecs: number;
  remaining: number;
  running: boolean;
}

const STORAGE_KEY_4H = 'pizza_timer_4h_endTime';
const STORAGE_KEY_2H = 'pizza_timer_2h_endTime';
const STORAGE_KEY_SW = 'pizza_stopwatch_startTime';

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

  constructor() {
    this.restoreState();

    // Ascolta l'evento di resume di Capacitor (app torna in primo piano)
    if (Capacitor.isNativePlatform()) {
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          this.restoreState();
        }
      });
    }
  }

  // ── Restore from localStorage ──────────────────────────
  private restoreState() {
    this.restoreTimer('4h');
    this.restoreTimer('2h');
    this.restoreStopwatch();
  }

  private restoreTimer(which: '4h' | '2h') {
    const key = which === '4h' ? STORAGE_KEY_4H : STORAGE_KEY_2H;
    const t = which === '4h' ? this.timer4h : this.timer2h;

    const endTimeStr = localStorage.getItem(key);
    if (!endTimeStr) return;

    const endTime = parseInt(endTimeStr, 10);
    const now = Date.now();
    const remainingSecs = Math.round((endTime - now) / 1000);

    if (remainingSecs <= 0) {
      // Timer già scaduto
      t.remaining = 0;
      t.running = false;
      localStorage.removeItem(key);
      // Ferma eventuale intervallo precedente
      if (which === '4h' && this.timer4hInterval) { clearInterval(this.timer4hInterval); this.timer4hInterval = null; }
      if (which === '2h' && this.timer2hInterval) { clearInterval(this.timer2hInterval); this.timer2hInterval = null; }
    } else {
      // Timer ancora in corso: aggiorna il remaining e riavvia l'intervallo
      t.remaining = remainingSecs;
      t.running = false; // verrà rimesso a true da _startInterval

      // Ferma eventuale intervallo precedente
      if (which === '4h' && this.timer4hInterval) { clearInterval(this.timer4hInterval); this.timer4hInterval = null; }
      if (which === '2h' && this.timer2hInterval) { clearInterval(this.timer2hInterval); this.timer2hInterval = null; }

      this._startInterval(which);
    }
  }

  private restoreStopwatch() {
    const startTimeStr = localStorage.getItem(STORAGE_KEY_SW);
    if (!startTimeStr) return;

    const startTime = parseInt(startTimeStr, 10);
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    this.stopwatchSeconds = elapsed;

    // Riavvia l'intervallo
    if (this.stopwatchInterval) clearInterval(this.stopwatchInterval);
    this.stopwatchRunning = true;
    this.stopwatchInterval = setInterval(() => this.stopwatchSeconds++, 1000);
  }

  // ── Stopwatch ──────────────────────────────────────────
  toggleStopwatch() {
    if (this.stopwatchRunning) {
      clearInterval(this.stopwatchInterval);
      this.stopwatchRunning = false;
      localStorage.removeItem(STORAGE_KEY_SW);
    } else {
      // Salva il momento di start (sottraendo i secondi già accumulati)
      const startTime = Date.now() - this.stopwatchSeconds * 1000;
      localStorage.setItem(STORAGE_KEY_SW, startTime.toString());
      this.stopwatchRunning = true;
      this.stopwatchInterval = setInterval(() => this.stopwatchSeconds++, 1000);
    }
  }

  resetStopwatch() {
    clearInterval(this.stopwatchInterval);
    this.stopwatchRunning = false;
    this.stopwatchSeconds = 0;
    localStorage.removeItem(STORAGE_KEY_SW);
  }

  // ── Countdown ──────────────────────────────────────────
  startTimer(which: '4h' | '2h') {
    const t = which === '4h' ? this.timer4h : this.timer2h;
    if (t.running || t.remaining === 0) return;

    // Salva la scadenza in localStorage
    const endTime = Date.now() + t.remaining * 1000;
    const key = which === '4h' ? STORAGE_KEY_4H : STORAGE_KEY_2H;
    localStorage.setItem(key, endTime.toString());

    // Schedula notifica nativa
    this.scheduleNativeNotification(t.label, t.remaining, which === '4h' ? 4 : 2);

    this._startInterval(which);
  }

  private _startInterval(which: '4h' | '2h') {
    const t = which === '4h' ? this.timer4h : this.timer2h;
    const key = which === '4h' ? STORAGE_KEY_4H : STORAGE_KEY_2H;
    t.running = true;

    const interval = setInterval(() => {
      if (t.remaining > 0) {
        t.remaining--;
      } else {
        clearInterval(interval);
        t.running = false;
        if (which === '4h') this.timer4hInterval = null;
        else this.timer2hInterval = null;
        localStorage.removeItem(key);
        this.sendNotification(t.label);
      }
    }, 1000);

    if (which === '4h') this.timer4hInterval = interval;
    else this.timer2hInterval = interval;
  }

  private async scheduleNativeNotification(label: string, seconds: number, id: number) {
    if (Capacitor.isNativePlatform()) {
      await LocalNotifications.cancel({ notifications: [{ id }] }).catch(() => {});
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
    if (which === '4h') this.timer4hInterval = null;
    else this.timer2hInterval = null;
    localStorage.removeItem(which === '4h' ? STORAGE_KEY_4H : STORAGE_KEY_2H);
    this.cancelNativeNotification(which === '4h' ? 4 : 2);
  }

  resetTimer(which: '4h' | '2h') {
    const t = which === '4h' ? this.timer4h : this.timer2h;
    const interval = which === '4h' ? this.timer4hInterval : this.timer2hInterval;
    clearInterval(interval);
    t.running = false;
    t.remaining = t.totalSecs;
    if (which === '4h') this.timer4hInterval = null;
    else this.timer2hInterval = null;
    localStorage.removeItem(which === '4h' ? STORAGE_KEY_4H : STORAGE_KEY_2H);
    this.cancelNativeNotification(which === '4h' ? 4 : 2);
  }

  // ── Helpers ────────────────────────────────────────────
  get anyActive(): boolean {
    return this.stopwatchRunning || this.timer4h.running || this.timer2h.running || this.isFinished;
  }

  get isFinished(): boolean {
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
      for (let i = 0; i < 5; i++) {
        beep(i * 0.38, 880, 0.22);
      }
      beep(5 * 0.38, 1100, 0.5);
    } catch (error: any) {
      console.warn('Audio non supportato', error);
    }
  }

}
