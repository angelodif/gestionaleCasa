import { Injectable, inject, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  Firestore,
  collection,
  getDocs,
  getDoc,
  doc,
  setDoc,
  writeBatch,
  collectionGroup,
  Timestamp
} from '@angular/fire/firestore';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { NotificationService } from '../notification/notification.service';
import { ConfirmService } from '../confirm/confirm.service';

export const BACKUP_FILENAME = 'gestionale_casa_backup.json';
const LAST_BACKUP_DATE_KEY = 'last_auto_backup_date';
const LAST_BACKUP_TIME_KEY = 'last_auto_backup_timestamp';

function serializeValue(val: any): any {
  if (val === null || val === undefined) return val;
  if (typeof val === 'object') {
    if (typeof val.toMillis === 'function') {
      return { _type: 'Timestamp', millis: val.toMillis() };
    }
    if (val instanceof Date) {
      return { _type: 'Date', iso: val.toISOString() };
    }
    if (Array.isArray(val)) {
      return val.map(serializeValue);
    }
    const res: any = {};
    for (const k of Object.keys(val)) {
      res[k] = serializeValue(val[k]);
    }
    return res;
  }
  return val;
}

function deserializeValue(val: any): any {
  if (val === null || val === undefined) return val;
  if (typeof val === 'object') {
    if (val._type === 'Timestamp' && typeof val.millis === 'number') {
      return Timestamp.fromMillis(val.millis);
    }
    if (val._type === 'Date' && typeof val.iso === 'string') {
      return new Date(val.iso);
    }
    if (Array.isArray(val)) {
      return val.map(deserializeValue);
    }
    const res: any = {};
    for (const k of Object.keys(val)) {
      res[k] = deserializeValue(val[k]);
    }
    return res;
  }
  return val;
}

@Injectable({
  providedIn: 'root'
})
export class BackupService {
  private firestore = inject(Firestore);
  private notification = inject(NotificationService);
  private confirmService = inject(ConfirmService);
  private platformId = inject(PLATFORM_ID);

  isBackingUp = signal<boolean>(false);
  isRestoring = signal<boolean>(false);
  lastBackupDate = signal<string | null>(null);

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.loadLastBackupInfo();
    }
  }

  loadLastBackupInfo() {
    const savedTime = localStorage.getItem(LAST_BACKUP_TIME_KEY);
    if (savedTime) {
      const d = new Date(Number(savedTime));
      this.lastBackupDate.set(
        d.toLocaleDateString('it-IT', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      );
    }
  }

  /**
   * Controlla se oggi è già stato eseguito il backup automatico.
   * Se non è ancora stato fatto, lo esegue e aggiorna la data.
   */
  async checkAndRunAutoBackup(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    try {
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
      const lastBackupDate = localStorage.getItem(LAST_BACKUP_DATE_KEY);

      if (lastBackupDate !== todayStr) {
        console.log(`[BackupService] Avvio backup automatico giornaliero per la data: ${todayStr}`);
        await this.createAndSaveBackup(true);
      }
    } catch (err) {
      console.warn('[BackupService] Errore durante il backup automatico giornaliero:', err);
    }
  }

  /**
   * Genera e salva il file di backup gestionale_casa_backup.json sovrascrivendo il precedente.
   */
  async createAndSaveBackup(isAuto: boolean = false): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    this.isBackingUp.set(true);
    try {
      const backupData = await this.collectAllData();
      const jsonString = JSON.stringify(backupData, null, 2);

      // 1. Su Android / iOS nativo: salva tramite @capacitor/filesystem sovrascrivendo il file
      if (Capacitor.isNativePlatform()) {
        try {
          await Filesystem.writeFile({
            path: BACKUP_FILENAME,
            data: jsonString,
            directory: Directory.Documents,
            encoding: Encoding.UTF8
          });
          console.log(`[BackupService] Backup salvato con successo in Documents/${BACKUP_FILENAME}`);
        } catch (fsErr) {
          // Fallback in Cache directory se Documents non è accessibile
          await Filesystem.writeFile({
            path: BACKUP_FILENAME,
            data: jsonString,
            directory: Directory.Cache,
            encoding: Encoding.UTF8
          });
        }
      } else {
        // 2. Su Web browser: download automatico del file JSON con nome fisso
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = BACKUP_FILENAME;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      // Salva snapshot locale per sicurezza
      try {
        localStorage.setItem('gestionale_casa_last_backup_json', jsonString);
      } catch (storageErr) {
        // LocalStorage quota superata (non bloccante)
      }

      const now = new Date();
      const todayStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
      localStorage.setItem(LAST_BACKUP_DATE_KEY, todayStr);
      localStorage.setItem(LAST_BACKUP_TIME_KEY, now.getTime().toString());
      this.loadLastBackupInfo();

      if (!isAuto) {
        this.notification.showSuccess('File di backup scaricato con successo!');
      } else {
        console.log('[BackupService] Backup automatico giornaliero completato.');
      }
    } catch (err: any) {
      console.error('[BackupService] Errore durante il backup:', err);
      if (!isAuto) {
        this.notification.showError('Errore durante la creazione del backup.');
      }
    } finally {
      this.isBackingUp.set(false);
    }
  }

  /**
   * Raccoglie tutti i dati da tutte le collezioni Firestore.
   */
  private async collectAllData(): Promise<any> {
    const data: any = {};

    // Helper per leggere una collection generica
    const fetchCollection = async (colPath: string): Promise<any[]> => {
      try {
        const snap = await getDocs(collection(this.firestore, colPath));
        return snap.docs.map(d => ({ id: d.id, ...serializeValue(d.data()) }));
      } catch (e) {
        console.warn(`[BackupService] Errore lettura collezione ${colPath}:`, e);
        return [];
      }
    };

    // Helper per leggere un documento singolo
    const fetchDoc = async (docPath: string): Promise<any> => {
      try {
        const snap = await getDoc(doc(this.firestore, docPath));
        return snap.exists() ? serializeValue(snap.data()) : null;
      } catch (e) {
        console.warn(`[BackupService] Errore lettura documento ${docPath}:`, e);
        return null;
      }
    };

    // 1. Finanze
    data.expenses = await fetchCollection('expenses');
    data.recurring_expenses = await fetchCollection('recurring_expenses');
    data.budgets = await fetchCollection('budgets');

    // Spese ed entrate personali per ciascun utente
    data.personal_expenses = {
      Angelo: await fetchCollection('personal_expenses/Angelo/expenses'),
      Daiana: await fetchCollection('personal_expenses/Daiana/expenses')
    };
    data.personal_earnings = {
      Angelo: await fetchCollection('personal_earnings/Angelo/earnings'),
      Daiana: await fetchCollection('personal_earnings/Daiana/earnings')
    };

    // 2. Scadenze
    data.deadlines = await fetchCollection('deadlines');

    // 3. Spesa e Rifiuti
    data.shopping = {
      current: await fetchDoc('shopping/current'),
      config: await fetchDoc('shopping/config')
    };
    data.waste = await fetchDoc('waste/config');

    // 4. Turni, Planner & Attività
    data.shifts = await fetchCollection('shifts');
    data.appointment_categories = await fetchCollection('appointment_categories');
    data.recurring_events = await fetchCollection('recurring_events');
    data.physical_activity_rules = await fetchCollection('physical_activity_rules');
    data.facility_timeslots = await fetchCollection('facility_timeslots');

    // Planners (Assignments settimanali)
    try {
      const assignmentsSnap = await getDocs(collectionGroup(this.firestore, 'assignments'));
      data.planners = assignmentsSnap.docs.map(d => ({
        weekId: d.ref.parent.parent?.id || '',
        dayName: d.id,
        data: serializeValue(d.data())
      }));
    } catch (e) {
      console.warn('[BackupService] Impossibile recuperare assignments via collectionGroup:', e);
      data.planners = [];
    }

    // Pasti (Days dei menu settimanali)
    try {
      const daysSnap = await getDocs(collectionGroup(this.firestore, 'days'));
      data.meals = daysSnap.docs.map(d => ({
        weekId: d.ref.parent.parent?.id || '',
        dayName: d.id,
        data: serializeValue(d.data())
      }));
    } catch (e) {
      console.warn('[BackupService] Impossibile recuperare days pasti via collectionGroup:', e);
      data.meals = [];
    }

    return {
      appName: 'GestionaleCasa',
      backupVersion: 1,
      createdAt: new Date().toISOString(),
      timestamp: Date.now(),
      data
    };
  }

  /**
   * Ripristina i dati da un file di backup JSON.
   */
  async restoreBackup(backupJson: any): Promise<boolean> {
    if (!backupJson || !backupJson.data) {
      this.notification.showError('File di backup non valido o danneggiato.');
      return false;
    }

    const ok = await this.confirmService.confirm({
      title: 'Ripristina Dati da Backup',
      message: `Sei sicuro di voler ripristinare il database dal backup del ${new Date(backupJson.createdAt || backupJson.timestamp).toLocaleString('it-IT')}? I dati attuali verranno aggiornati con quelli presenti nel backup.`,
      confirmLabel: 'Ripristina',
      cancelLabel: 'Annulla'
    });

    if (!ok) return false;

    this.isRestoring.set(true);
    try {
      const d = backupJson.data;

      // Helper per scrivere una lista in batch
      const restoreCollection = async (colPath: string, items: any[]) => {
        if (!items || items.length === 0) return;
        const batchSize = 450;
        for (let i = 0; i < items.length; i += batchSize) {
          const batch = writeBatch(this.firestore);
          const chunk = items.slice(i, i + batchSize);
          for (const item of chunk) {
            const { id, ...payload } = item;
            if (id) {
              const docRef = doc(this.firestore, colPath, id);
              batch.set(docRef, deserializeValue(payload), { merge: true });
            }
          }
          await batch.commit();
        }
      };

      // 1. Finanze
      await restoreCollection('expenses', d.expenses);
      await restoreCollection('recurring_expenses', d.recurring_expenses);
      await restoreCollection('budgets', d.budgets);

      if (d.personal_expenses) {
        await restoreCollection('personal_expenses/Angelo/expenses', d.personal_expenses.Angelo);
        await restoreCollection('personal_expenses/Daiana/expenses', d.personal_expenses.Daiana);
      }
      if (d.personal_earnings) {
        await restoreCollection('personal_earnings/Angelo/earnings', d.personal_earnings.Angelo);
        await restoreCollection('personal_earnings/Daiana/earnings', d.personal_earnings.Daiana);
      }

      // 2. Scadenze
      await restoreCollection('deadlines', d.deadlines);

      // 3. Spesa e Rifiuti
      if (d.shopping?.current) {
        await setDoc(doc(this.firestore, 'shopping/current'), deserializeValue(d.shopping.current), { merge: true });
      }
      if (d.shopping?.config) {
        await setDoc(doc(this.firestore, 'shopping/config'), deserializeValue(d.shopping.config), { merge: true });
      }
      if (d.waste) {
        await setDoc(doc(this.firestore, 'waste/config'), deserializeValue(d.waste), { merge: true });
      }

      // 4. Turni, Planner & Attività
      await restoreCollection('shifts', d.shifts);
      await restoreCollection('appointment_categories', d.appointment_categories);
      await restoreCollection('recurring_events', d.recurring_events);
      await restoreCollection('physical_activity_rules', d.physical_activity_rules);
      await restoreCollection('facility_timeslots', d.facility_timeslots);

      // Planner assignments
      if (d.planners && Array.isArray(d.planners)) {
        for (const p of d.planners) {
          if (p.weekId && p.dayName && p.data) {
            const docRef = doc(this.firestore, `planners/${p.weekId}/assignments`, p.dayName);
            await setDoc(docRef, deserializeValue(p.data), { merge: true });
          }
        }
      }

      // Pasti
      if (d.meals && Array.isArray(d.meals)) {
        for (const m of d.meals) {
          if (m.weekId && m.dayName && m.data) {
            const docRef = doc(this.firestore, `weeks/${m.weekId}/days/${m.dayName}`);
            await setDoc(docRef, deserializeValue(m.data), { merge: true });
          }
        }
      }

      this.notification.showSuccess('Ripristino completato con successo!');
      return true;
    } catch (err: any) {
      console.error('[BackupService] Errore durante il ripristino:', err);
      this.notification.showError('Errore durante il ripristino del backup.');
      return false;
    } finally {
      this.isRestoring.set(false);
    }
  }
}
