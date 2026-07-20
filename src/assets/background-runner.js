/**
 * Background Runner script per il re-scheduling delle notifiche turni.
 *
 * Questo file viene eseguito dall'OS in un contesto JavaScript separato
 * (non nell'app Angular) quando l'app è in background.
 *
 * ⚠️  Il Background Runner NON ha accesso al DOM, ai servizi Angular, né a Firestore.
 *     Può solo:
 *      - Usare le API Capacitor esposte dal native layer (DispatchQueue/WorkManager)
 *      - Triggerare notifiche locali pre-configurate
 *
 * Strategia: il runner si limita a emettere una notifica "reminder" se le
 * notifiche turni non sono state aggiornate negli ultimi 2 giorni.
 * Il testo invita l'utente ad aprire l'app per aggiornare gli orari.
 * (L'aggiornamento reale avviene poi all'apertura dell'app via ShiftNotificationService)
 */

// Evento 'backgroundFetch' - triggerato periodicamente dall'OS (circa ogni 15min iOS, variabile Android)
addEventListener('backgroundFetch', async (resolve) => {
  try {
    // Leggi la data dell'ultimo scheduling da localStorage condiviso
    const lastScheduledRaw = CapacitorKV.get('shift_notifications_last_scheduled');
    const lastScheduled = lastScheduledRaw ? new Date(lastScheduledRaw) : null;

    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    // Se le notifiche non sono state aggiornate da più di 2 giorni, invia un reminder
    if (!lastScheduled || lastScheduled < twoDaysAgo) {
      await CapacitorNotifications.schedule({
        notifications: [
          {
            id: 9999,
            title: '🔔 Aggiorna gli orari',
            body: 'Apri l\'app per aggiornare il promemoria del turno di domani.',
            schedule: { at: new Date(now.getTime() + 1000) }, // 1 secondo nel futuro
          },
        ],
      });
    }
  } catch (e) {
    // Ignora errori — il background runner non deve crashare
  } finally {
    resolve();
  }
});
