import { Injectable, inject, signal } from '@angular/core';

import {
  Firestore,
  collection,
  collectionData,
  doc,
  docData,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy
} from '@angular/fire/firestore';
import { Observable, firstValueFrom } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthService } from '../../core/services/auth/auth.service';
import { BodyMetricConfigService } from '../../services/body-metric-config/body-metric-config.service';
import {
  BodyMetricConfig,
  UserMetricConfigs,
  DEFAULT_BODY_METRIC_DEFINITIONS,
  getDefaultMetricDefinition
} from '../../models/body-metric-config.model';

export interface BodyMeasurement {
  id?: string;
  userId: string;
  userName: 'Angelo' | 'Daiana';
  date: number; // timestamp ms
  isPrivate: boolean;

  // Dati di misurazione
  weight: number; // in kg
  heightCm?: number; // in cm (es. 170)
  bmi: number; // Indice di massa corporea
  bodyFatPercent: number; // % massa grassa
  waterPercent: number; // % acqua
  proteinPercent: number; // % proteine
  bmrKcal: number; // Metabolismo basale in kcal
  visceralFat: number; // Livello grasso viscerale (unità)
  muscleKg: number; // Muscoli in kg
  boneMassKg: number; // Massa ossea in kg
  bodyAge: number; // Età del corpo in anni
  bodyState: string; // Sottopeso, Bilanciato, Sovrappeso, Obeso
  notes?: string;

  // Calcolati al salvataggio rispetto alla pesata precedente (fluttuazioni)
  weightDiff?: number;
  fatDiff?: number;
  muscleDiff?: number;
  waterDiff?: number;
}

export interface BodySettings {
  bodyTrackingEnabled: boolean;
  hideMyMeasurements: boolean; // se true non visibile agli altri account
  defaultHeightCm?: number; // default per calcolo BMI
}

export interface MetricStatus {
  label: string;
  color: string;
  badgeClass: 'good' | 'normal' | 'warn' | 'danger' | 'info';
}

@Injectable({
  providedIn: 'root'
})
export class BodyMeasurementService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);
  private bodyMetricConfigService = inject(BodyMetricConfigService);

  // Signal reattivo: quando viene aggiornato, i template OnPush si ri-renderizzano
  private _configsVersion = signal(0);
  /** Esposto in sola lettura: usato nel template per forzare la rivalutazione dei gauge */
  readonly configsVersion = this._configsVersion.asReadonly();

  private customConfigsByUser: { [userName: string]: UserMetricConfigs } = {};

  setUserConfigs(userName: 'Angelo' | 'Daiana', configs: UserMetricConfigs) {
    this.customConfigsByUser[userName] = configs;
    // Incrementa la versione per notificare i template che le configs sono cambiate
    this._configsVersion.update(v => v + 1);
  }

  getUserConfigs(userName: 'Angelo' | 'Daiana'): UserMetricConfigs | undefined {
    return this.customConfigsByUser[userName];
  }

  /**
   * Valutazioni e range semantici come da specifiche utente
   */
  evaluateBmi(bmi: number): MetricStatus {
    if (bmi <= 18.5) return { label: 'Basso', color: '#0284c7', badgeClass: 'info' };
    if (bmi <= 25.0) return { label: 'Normale', color: '#10b981', badgeClass: 'good' };
    if (bmi <= 30.0) return { label: 'Alto', color: '#f59e0b', badgeClass: 'warn' };
    return { label: 'Molto alto', color: '#ef4444', badgeClass: 'danger' };
  }

  evaluateBodyFat(fat: number): MetricStatus {
    if (fat <= 11.0) return { label: 'Molto basso', color: '#0284c7', badgeClass: 'info' };
    if (fat <= 17.0) return { label: 'Basso', color: '#0ea5e9', badgeClass: 'info' };
    if (fat <= 22.0) return { label: 'Normale', color: '#10b981', badgeClass: 'good' };
    if (fat <= 27.0) return { label: 'Aumentato', color: '#f59e0b', badgeClass: 'warn' };
    return { label: 'Alto', color: '#ef4444', badgeClass: 'danger' };
  }

  evaluateWater(water: number): MetricStatus {
    if (water <= 55.0) return { label: 'Insufficiente', color: '#ef4444', badgeClass: 'danger' };
    if (water <= 65.0) return { label: 'Normale', color: '#f59e0b', badgeClass: 'warn' };
    return { label: 'Buono', color: '#10b981', badgeClass: 'good' };
  }

  evaluateProtein(prot: number): MetricStatus {
    if (prot <= 16.0) return { label: 'Insufficiente', color: '#ef4444', badgeClass: 'danger' };
    if (prot <= 18.0) return { label: 'Normale', color: '#f59e0b', badgeClass: 'warn' };
    return { label: 'Buono', color: '#10b981', badgeClass: 'good' };
  }

  evaluateVisceralFat(vf: number, userName?: 'Angelo' | 'Daiana'): MetricStatus {
    // Usa la configurazione personalizzata se disponibile
    if (userName) {
      const userConfig = this.customConfigsByUser[userName]?.['visceralFat'];
      if (userConfig?.segments?.length) {
        const seg = userConfig.segments.find((s: any) => vf >= s.min && vf <= s.max)
          ?? userConfig.segments[userConfig.segments.length - 1];
        if (seg) {
          return { label: seg.label, color: seg.color, badgeClass: 'warn' };
        }
      }
    }
    // Fallback default
    if (vf <= 10) return { label: 'Normale',   color: '#10b981', badgeClass: 'good' };
    if (vf <= 15) return { label: 'Alto',       color: '#f59e0b', badgeClass: 'warn' };
    return               { label: 'Molto alto', color: '#ef4444', badgeClass: 'danger' };
  }


  evaluateMuscle(muscle: number): MetricStatus {
    if (muscle <= 49.5) return { label: 'Insufficiente', color: '#f59e0b', badgeClass: 'warn' };
    if (muscle <= 59.40) return { label: 'Normale', color: '#0284c7', badgeClass: 'normal' };
    return { label: 'Buono', color: '#10b981', badgeClass: 'good' };
  }

  evaluateBoneMass(bone: number): MetricStatus {
    if (bone <= 3.20) return { label: 'Insufficiente', color: '#ef4444', badgeClass: 'danger' };
    if (bone <= 4.20) return { label: 'Normale', color: '#10b981', badgeClass: 'good' };
    return { label: 'Buono', color: '#059669', badgeClass: 'good' };
  }

  evaluateBodyState(weight: number): MetricStatus {
    if (weight <= 53.50) return { label: 'Sottopeso', color: '#0284c7', badgeClass: 'info' };
    if (weight <= 72.30) return { label: 'Bilanciato', color: '#10b981', badgeClass: 'good' };
    if (weight <= 86.70) return { label: 'Sovrappeso', color: '#f59e0b', badgeClass: 'warn' };
    return { label: 'Obeso', color: '#ef4444', badgeClass: 'danger' };
  }

  calculateBmi(weightKg: number, heightCm: number): number {
    if (!heightCm || heightCm <= 0) return 0;
    const heightM = heightCm / 100;
    return Number((weightKg / (heightM * heightM)).toFixed(1));
  }

  /**
   * Fornisce segmenti di scala colorati e posizione percentuale (0-100%)
   * per tracciare a che punto del percorso/scala si trova il valore.
   */
  getMetricGauge(
    type: 'weight' | 'bmi' | 'bodyFat' | 'muscle' | 'water' | 'protein' | 'bmr' | 'visceralFat' | 'boneMass',
    value: number,
    userName?: 'Angelo' | 'Daiana'
  ) {
    const userConfig = userName ? this.customConfigsByUser[userName]?.[type] : null;
    let min = 0;
    let max = 100;
    let unit = '%';
    let segments: { label: string; min: number; max: number; color: string }[] = [];

    if (userConfig && userConfig.segments && userConfig.segments.length > 0) {
      segments = userConfig.segments;
      min = Math.min(...segments.map(s => s.min));
      max = Math.max(...segments.map(s => s.max));
      unit = userConfig.unit ?? (getDefaultMetricDefinition(type, userName)?.unit ?? unit);
    } else {
      const def = getDefaultMetricDefinition(type, userName);
      if (def) {
        min = def.min;
        max = def.max;
        unit = def.unit;
        segments = def.defaultSegments;
      }
    }

    const clampedVal = Math.max(min, Math.min(max, value || min));
    const percent = Math.round(((clampedVal - min) / (max - min)) * 100);
    const segmentBars = segments.map(s => {
      const segWidth = ((s.max - s.min) / (max - min)) * 100;
      return { ...s, widthPercent: segWidth };
    });

    return {
      min,
      max,
      unit,
      value,
      clampedVal,
      percent,
      segments: segmentBars
    };
  }





  // --- IMPOSTAZIONI PROFILO ---
  getUserSettingsStream(userId: string): Observable<BodySettings> {
    const docRef = doc(this.firestore, `users/${userId}/settings/body`);
    return docData(docRef).pipe(
      map((data: any) => ({
        bodyTrackingEnabled: !!data?.bodyTrackingEnabled,
        hideMyMeasurements: !!data?.hideMyMeasurements,
        defaultHeightCm: data?.defaultHeightCm ?? 170
      }))
    );
  }

  // Ottiene lo stato di privacy globale (chi ha nascosto le proprie misurazioni)
  getPublicPrivacySettingsStream(): Observable<{ angeloHidden: boolean; daianaHidden: boolean }> {
    const docRef = doc(this.firestore, 'body_settings/privacy');
    return docData(docRef).pipe(
      map((data: any) => ({
        angeloHidden: !!data?.angeloHidden,
        daianaHidden: !!data?.daianaHidden
      }))
    );
  }

  // Permette di leggere la privacy direttamente da Firestore una tantum o salvare
  async setPrivacyForUser(userName: 'Angelo' | 'Daiana', isHidden: boolean): Promise<void> {
    const publicDoc = doc(this.firestore, 'body_settings/privacy');
    const field = userName === 'Angelo' ? 'angeloHidden' : 'daianaHidden';
    await setDoc(publicDoc, { [field]: isHidden }, { merge: true });
  }

  async saveUserSettings(userId: string, settings: Partial<BodySettings>, userName?: 'Angelo' | 'Daiana'): Promise<void> {
    const docRef = doc(this.firestore, `users/${userId}/settings/body`);
    await setDoc(docRef, settings, { merge: true });

    // Sincronizziamo SEMPRE sul doc pubblico
    const publicDoc = doc(this.firestore, 'body_settings/privacy');
    if (settings.hideMyMeasurements !== undefined) {
      if (userName) {
        const field = userName === 'Angelo' ? 'angeloHidden' : 'daianaHidden';
        await setDoc(publicDoc, { [field]: settings.hideMyMeasurements }, { merge: true });
      }
    }
  }

  // --- CRUD MISURAZIONI CORPOREE ---
  getMeasurementsStream(): Observable<BodyMeasurement[]> {
    const colRef = collection(this.firestore, 'body_measurements');
    const q = query(colRef, orderBy('date', 'desc'));
    return collectionData(q, { idField: 'id' }) as Observable<BodyMeasurement[]>;
  }

  async addMeasurement(measurement: Omit<BodyMeasurement, 'id'>): Promise<string> {
    const colRef = collection(this.firestore, 'body_measurements');
    const id = doc(colRef).id;

    // Recupera la pesata precedente dello stesso utente per calcolare la differenza
    const q = query(
      colRef,
      where('userName', '==', measurement.userName),
      where('date', '<', measurement.date),
      orderBy('date', 'desc')
    );

    let weightDiff = 0;
    let fatDiff = 0;
    let muscleDiff = 0;
    let waterDiff = 0;

    try {
      const prevDocs = await firstValueFrom(
        collectionData(q, { idField: 'id' }).pipe(map(docs => docs as BodyMeasurement[]))
      );
      if (prevDocs && prevDocs.length > 0) {
        const prev = prevDocs[0];
        weightDiff = Number((measurement.weight - prev.weight).toFixed(2));
        fatDiff = Number((measurement.bodyFatPercent - prev.bodyFatPercent).toFixed(1));
        muscleDiff = Number((measurement.muscleKg - prev.muscleKg).toFixed(2));
        waterDiff = Number((measurement.waterPercent - prev.waterPercent).toFixed(1));
      }
    } catch (e) {
      console.warn('Impossibile calcolare fluttuazione precedente:', e);
    }

    const payload: BodyMeasurement = {
      ...measurement,
      id,
      weightDiff,
      fatDiff,
      muscleDiff,
      waterDiff
    };

    await setDoc(doc(this.firestore, `body_measurements/${id}`), payload);
    return id;
  }

  async updateMeasurement(id: string, measurement: Partial<BodyMeasurement>): Promise<void> {
    const docRef = doc(this.firestore, `body_measurements/${id}`);
    await setDoc(docRef, measurement, { merge: true });
  }

  async deleteMeasurement(id: string): Promise<void> {
    const docRef = doc(this.firestore, `body_measurements/${id}`);
    await deleteDoc(docRef);
  }
}
