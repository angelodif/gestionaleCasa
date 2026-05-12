import { Injectable, inject } from '@angular/core';
import { MatSnackBar, MatSnackBarConfig } from '@angular/material/snack-bar';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private snackBar = inject(MatSnackBar);

  private baseConfig: MatSnackBarConfig = {
    duration: 4000,
    horizontalPosition: 'center',
    verticalPosition: 'bottom',
  };

  showSuccess(message: string) {
    console.log(`[Notification Success] ${message}`);
    this.snackBar.open(`✅ ${message}`, 'Chiudi', {
      ...this.baseConfig,
      panelClass: ['snack-success'],
    });
  }

  showError(message: string, duration = 5000) {
    console.error(`[Notification Error] ${message}`);
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
   * @param fn       La funzione asincrona da eseguire (es. una chiamata Firebase)
   * @param maxRetries  Numero massimo di tentativi aggiuntivi (default: 2 → 3 tot)
   * @param delayMs  Ritardo iniziale in ms (raddoppia ad ogni tentativo)
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
          const wait = delayMs * Math.pow(2, attempt); // 1s, 2s, 4s...
          console.warn(`[Retry ${attempt + 1}/${maxRetries}] Attendo ${wait}ms prima di riprovare...`);
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
        setTimeout(() => reject(new Error('Timeout operazione (Firebase lento o offline)')), timeoutMs)
      )
    ]);
  }

  /**
   * Esegue una funzione async con retry e mostra un errore se fallisce definitivamente.
   */
  async runWithRetry<T>(
    fn: () => Promise<T>,
    errorMessage: string = 'Operazione fallita',
    maxRetries = 2,
    timeoutMs = 15000
  ): Promise<T> {
    // 1. Controllo preventivo: se siamo offline, falliamo subito senza nemmeno accodare a Firebase
    if (!navigator.onLine) {
      this.showError(`${errorMessage}: Sei offline. Connessione richiesta.`);
      throw new Error('Offline: operazione annullata per evitare code in sospeso.');
    }

    try {
      // 2. Esegui con retry e timeout
      return await this.retryWithBackoff(() => this.withTimeout(fn(), timeoutMs), maxRetries);
    } catch (error: any) {
      console.error(`[Retry Error] ${errorMessage}:`, error);
      
      // Mostriamo l'errore e rilanciamo per permettere il rollback nei componenti
      this.showError(errorMessage);
      throw error;
    }
  }
}

