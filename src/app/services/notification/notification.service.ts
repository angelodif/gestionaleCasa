import { Injectable, inject, signal } from '@angular/core';
import { MatSnackBar, MatSnackBarConfig } from '@angular/material/snack-bar';
import { Haptics, NotificationType } from '@capacitor/haptics';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private snackBar = inject(MatSnackBar);
  
  // Segnale globale per lo stato di caricamento/salvataggio
  isLoading = signal<boolean>(false);

  private baseConfig: MatSnackBarConfig = {
    duration: 4000,
    horizontalPosition: 'center',
    verticalPosition: 'bottom',
  };

  private async triggerHapticFeedback(type: NotificationType) {
    try {
      await Haptics.notification({ type });
    } catch {
      // Ignora silenziosamente su web / desktop
    }
  }

  showSuccess(message: string) {
    console.log(`[Notification Success] ${message}`);
    this.triggerHapticFeedback(NotificationType.Success);
    this.snackBar.open(`✅ ${message}`, 'Chiudi', {
      ...this.baseConfig,
      duration: 2000,
      panelClass: ['snack-success'],
    });
  }

  showError(message: string, duration = 5000) {
    console.error(`[Notification Error] ${message}`);
    this.triggerHapticFeedback(NotificationType.Error);
    this.snackBar.open(`❌ ${message}`, 'Chiudi', {
      ...this.baseConfig,
      duration,
      panelClass: ['snack-error'],
    });
  }

  showInfo(message: string) {
    this.snackBar.open(`ℹ️ ${message}`, 'Chiudi', {
      ...this.baseConfig,
      panelClass: ['snack-info'],
    });
  }

  /**
   * Esegue una funzione async con retry automatico ed exponential backoff.
   */
  async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries = 2,
    delayMs = 1000
  ): Promise<T> {
    let lastError: any;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        if (attempt < maxRetries) {
          const wait = delayMs * Math.pow(2, attempt);
          console.warn(`[Retry ${attempt + 1}/${maxRetries}] Attendo ${wait}ms...`);
          await new Promise(resolve => setTimeout(resolve, wait));
        }
      }
    }
    throw lastError;
  }

  /**
   * Avvolge una promessa con un timeout.
   */
  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)
      )
    ]);
  }

  /**
   * Esegue una funzione async con retry, timeout e gestione dello stato loading.
   */
  async runWithRetry<T>(
    fn: () => Promise<T>,
    errorMessage: string = 'Operazione fallita',
    maxRetries = 2,
    timeoutMs = 10000 // Ridotto a 10s per migliore UX mobile
  ): Promise<T> {
    // Controllo preventivo offline
    if (!navigator.onLine) {
      this.showError(`${errorMessage}: Sei offline. Connessione richiesta.`);
      throw new Error('Offline');
    }

    this.isLoading.set(true);
    try {
      return await this.retryWithBackoff(() => this.withTimeout(fn(), timeoutMs), maxRetries);
    } catch (error: any) {
      console.error(`[Retry Error] ${errorMessage}:`, error);
      
      const isTimeout = error.message === 'TIMEOUT';
      const finalMsg = isTimeout 
        ? `${errorMessage}: Tempo scaduto (connessione lenta).` 
        : errorMessage;
      
      this.showError(finalMsg);
      throw error;
    } finally {
      this.isLoading.set(false);
    }
  }
}

