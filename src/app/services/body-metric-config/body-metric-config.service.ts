import { Injectable, inject } from '@angular/core';
import { Firestore, doc, docData, setDoc } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { BodyMetricConfig, UserMetricConfigs } from '../../models/body-metric-config.model';

/**
 * Service per la memorizzazione e il recupero delle configurazioni
 * degli intervalli per metrica corporea per singola persona ('Angelo' | 'Daiana').
 * I dati vengono salvati su: body_metric_configs/{userName}
 */
@Injectable({
  providedIn: 'root'
})
export class BodyMetricConfigService {
  private firestore = inject(Firestore);

  /**
   * Restituisce la mappa di tutte le metriche configurate per la persona ('Angelo' o 'Daiana').
   */
  getUserConfigs(userName: 'Angelo' | 'Daiana'): Observable<UserMetricConfigs> {
    const docRef = doc(this.firestore, `body_metric_configs/${userName}`);
    return docData(docRef).pipe(
      map((data: any) => (data ? (data as UserMetricConfigs) : {}))
    );
  }

  /**
   * Restituisce la configurazione di una specifica metrica per la persona indicata.
   */
  getMetricConfig(userName: 'Angelo' | 'Daiana', metricType: string): Observable<BodyMetricConfig | null> {
    return this.getUserConfigs(userName).pipe(
      map(configs => configs[metricType] ?? null)
    );
  }

  /**
   * Salva o aggiorna la configurazione per una specifica metrica della persona indicata,
   * preservando tutte le altre metriche già configurate.
   */
  async setConfig(userName: 'Angelo' | 'Daiana', config: BodyMetricConfig): Promise<void> {
    const docRef = doc(this.firestore, `body_metric_configs/${userName}`);
    await setDoc(docRef, { [config.type]: config }, { merge: true });
  }
}
