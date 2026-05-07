import { Injectable } from '@angular/core';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { environment } from '../../../environments/environment';

const funnyStationConfig = environment.funnyStation;

@Injectable({
  providedIn: 'root'
})
export class FunnyStationSyncService {
  private funnyDb: any;
  private isInitialized = false;

  constructor() {
    try {
      const app = initializeApp(funnyStationConfig, 'funnyStationApp');
      this.funnyDb = getFirestore(app);
      this.isInitialized = true;
    } catch (e) {
      console.error('Errore inizializzazione Funny Station App:', e);
    }
  }

  async syncEventsWithCredentials(email: string, password: string): Promise<any[]> {
    if (!this.isInitialized) return [];
    
    const auth = getAuth(this.funnyDb.app);
    let events: any[] = [];
    
    try {
      // 1. Esegui il login
      await signInWithEmailAndPassword(auth, email, password);
      
      // 2. Scarica i dati
      const colRef = collection(this.funnyDb, 'contracts');
      const snap = await getDocs(colRef);
      
      snap.forEach(doc => {
        const data = doc.data();
        // Filtra solo gli eventi confermati
        if (data && data['evento'] && data['confermato'] === true) {
          const rawDate = data['evento'].data;
          const parsedDate = this.parseFunnyDate(rawDate);
          
          if (parsedDate) {
            events.push({
              id: doc.id,
              date: parsedDate, // Ritorna sempre yyyy-mm-dd per coerenza
              title: `FS: ${data['evento'].tipologia || 'Evento'}`,
              startTime: data['pacchetto']?.orarioInizio || '00:00',
              endTime: data['pacchetto']?.orarioFine || '23:59',
              category: 'second_job',
              color: '#e91e63',
              target: 'Angelo'
            });
          }
        }
      });
      
    } catch (error) {
      console.error('Errore durante la sync da Funny Station:', error);
      throw error;
    } finally {
      // 3. Fai logout in modo sicuro
      try {
        await signOut(auth);
      } catch (e) {
        console.error('Errore durante il logout di Funny Station', e);
      }
    }
    
    return events;
  }

  // Helper per gestire date gg/mm/aaaa o yyyy-mm-dd
  private parseFunnyDate(dateStr: string): string | null {
    if (!dateStr) return null;
    
    // Caso yyyy-mm-dd
    if (dateStr.includes('-')) {
      const parts = dateStr.split('-');
      if (parts[0].length === 4) return dateStr;
      // Caso dd-mm-yyyy (raro ma possibile)
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    
    // Caso dd/mm/aaaa
    if (dateStr.includes('/')) {
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        const day = parts[0].padStart(2, '0');
        const month = parts[1].padStart(2, '0');
        const year = parts[2];
        return `${year}-${month}-${day}`;
      }
    }
    
    return null;
  }
}
