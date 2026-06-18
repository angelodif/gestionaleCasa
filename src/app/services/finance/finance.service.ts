import { Injectable, inject } from '@angular/core';
import { Firestore, collection, doc, docData, setDoc, getDoc, getDocs, collectionData, query, orderBy, where, addDoc, updateDoc, deleteDoc, Timestamp } from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';
import { NotificationService } from '../notification/notification.service';

export interface Budget {
  monthYear: string; // e.g. "2024-04"
  totalLiquid: number;
  totalVouchers: number;
  remainingVouchers?: number;
}

export interface Expense {
  id?: string;
  totalAmount: number;
  liquidAmount: number;
  voucherAmount: number;
  vouchersUsed: number;
  category: string;
  date: number;
  note?: string;
  user?: 'Angelo' | 'Daiana';
  useBudget?: boolean;
}

export interface RecurringExpense {
  id?: string;
  name: string;
  amount: number;
  category: string;
  method: 'liquid' | 'voucher';
  useBudget?: boolean;
}

export interface FinanceStats {
  totalSpent: number;
  byCategory: { [key: string]: number };
  liquidSpent: number;
  voucherSpent: number;
  extraBudgetSpent: number;
  extraBudgetAngelo?: number;
  extraBudgetDaiana?: number;
  maxCatValue: number;
}

export const FINANCE_CATEGORIES = [
  'Spesa Alimentare',
  'Ristorante',
  'Prodotti Casalinghi',
  'Carburanti',
  'Manutenzione Auto',
  'Tasse Auto',
  'Personale',
  'Casa (Affitto/Mutuo)',
  'Bollette',
  'Altro'
];

export const FINANCE_CATEGORY_ICONS: { [key: string]: string } = {
  'Spesa Alimentare': 'shopping_basket',
  'Ristorante': 'restaurant',
  'Prodotti Casalinghi': 'cleaning_services',
  'Carburanti': 'local_gas_station',
  'Manutenzione Auto': 'build',
  'Tasse Auto': 'description',
  'Personale': 'person',
  'Casa (Affitto/Mutuo)': 'home',
  'Bollette': 'receipt_long',
  'Altro': 'more_horiz'
};

@Injectable({ providedIn: 'root' })
export class FinanceService {
  private firestore = inject(Firestore);
  private notificationService = inject(NotificationService);

  // --- BUDGET ---
  async getBudget(monthYear: string): Promise<Budget | null> {
    const docRef = doc(this.firestore, `budgets/${monthYear}`);
    const snap = await getDoc(docRef);
    return snap.exists() ? (snap.data() as Budget) : null;
  }

  async saveBudget(budget: Budget) {
    return this.notificationService.runWithRetry(async () => {
      const docRef = doc(this.firestore, `budgets/${budget.monthYear}`);
      await setDoc(docRef, budget, { merge: true });
    }, 'Errore durante il salvataggio del budget');
  }

  // --- EXPENSES ---
  getAllExpenses(): Observable<Expense[]> {
    const colRef = collection(this.firestore, 'expenses');
    return collectionData(colRef, { idField: 'id' }).pipe(
      map(data => {
        return (data as any[]).map(e => {
          let dateNum = e.date;
          if (e.date && typeof e.date.toMillis === 'function') dateNum = e.date.toMillis();
          return { ...e, date: dateNum } as Expense;
        });
      })
    );
  }

  getMonthlyExpenses(monthYear: string): Observable<Expense[]> {
    const [year, month] = monthYear.split('-').map(Number);
    const start = Timestamp.fromDate(new Date(year, month - 1, 1));
    const end = Timestamp.fromDate(new Date(year, month, 1));

    const colRef = collection(this.firestore, 'expenses');
    // Semplifichiamo la query rimuovendo l'orderBy per testare se è un problema di indici
    const q = query(
      colRef, 
      where('date', '>=', start), 
      where('date', '<', end)
    );
    return collectionData(q, { idField: 'id' }).pipe(
      map(data => {
        // Gestione flessibile: converte Timestamp in Number se necessario
        return (data as any[]).map(e => {
          let dateNum = e.date;
          // Se Firebase restituisce un oggetto Timestamp, convertiamolo in millisecondi
          if (e.date && typeof e.date.toMillis === 'function') {
            dateNum = e.date.toMillis();
          }
          return { ...e, date: dateNum } as Expense;
        }).sort((a, b) => b.date - a.date);
      })
    );
  }

  async addExpense(expense: Expense) {
    const colRef = collection(this.firestore, 'expenses');
    const newDocRef = doc(colRef); // Genera ID client-side per idempotenza nei retry

    return this.notificationService.runWithRetry(async () => {
      const dataToSave = {
        ...expense,
        date: Timestamp.fromMillis(expense.date)
      };
      await setDoc(newDocRef, dataToSave);
      
      if (expense.useBudget === false && expense.user) {
        const personalColRef = collection(this.firestore, `personal_expenses/${expense.user}/expenses`);
        const personalDocRef = doc(personalColRef, newDocRef.id);
        await setDoc(personalDocRef, dataToSave);
      }
      
      const dateObj = new Date(expense.date);
      const monthYear = `${dateObj.getFullYear()}-${(dateObj.getMonth() + 1).toString().padStart(2, '0')}`;
      await this.getBudget(monthYear);
    }, 'Errore durante l\'aggiunta della spesa');
  }

  // --- RECURRING EXPENSES ---
  getRecurringExpenses(): Observable<RecurringExpense[]> {
    const colRef = collection(this.firestore, 'recurring_expenses');
    return collectionData(colRef, { idField: 'id' }) as Observable<RecurringExpense[]>;
  }

  async saveRecurringExpense(expense: RecurringExpense) {
    return this.notificationService.runWithRetry(async () => {
      if (expense.id) {
        const docRef = doc(this.firestore, `recurring_expenses/${expense.id}`);
        await setDoc(docRef, expense, { merge: true });
      } else {
        const colRef = collection(this.firestore, 'recurring_expenses');
        const newDocRef = doc(colRef);
        await setDoc(newDocRef, expense);
      }
    }, 'Errore durante il salvataggio della spesa ricorrente');
  }

  getRangeExpenses(startMonthYear: string, endMonthYear: string): Observable<Expense[]> {
    const [sYear, sMonth] = startMonthYear.split('-').map(Number);
    const [eYear, eMonth] = endMonthYear.split('-').map(Number);
    
    const start = Timestamp.fromDate(new Date(sYear, sMonth - 1, 1));
    const end = Timestamp.fromDate(new Date(eYear, eMonth, 1));

    const colRef = collection(this.firestore, 'expenses');
    const q = query(colRef, where('date', '>=', start), where('date', '<', end));
    
    return collectionData(q, { idField: 'id' }).pipe(
      map(data => (data as any[]).map(e => ({
        ...e,
        date: e.date?.toMillis ? e.date.toMillis() : e.date
      }) as Expense))
    );
  }

  async getRangeBudgets(startMonthYear: string, endMonthYear: string): Promise<Budget[]> {
    const colRef = collection(this.firestore, 'budgets');
    const q = query(colRef, where('monthYear', '>=', startMonthYear), where('monthYear', '<=', endMonthYear));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as Budget);
  }

  async updateExpense(expense: Expense) {
    if (!expense.id) return;
    return this.notificationService.runWithRetry(async () => {
      const docRef = doc(this.firestore, `expenses/${expense.id}`);
      const dataToSave = {
        ...expense,
        date: Timestamp.fromMillis(expense.date)
      };
      await setDoc(docRef, dataToSave, { merge: true });

      if (expense.useBudget === false && expense.user) {
        const personalDocRef = doc(this.firestore, `personal_expenses/${expense.user}/expenses/${expense.id}`);
        await setDoc(personalDocRef, dataToSave, { merge: true });
      }
    }, 'Errore durante la modifica della spesa');
  }

  async deleteExpense(id: string) {
    return this.notificationService.runWithRetry(async () => {
      const docRef = doc(this.firestore, `expenses/${id}`);
      const snap = await getDoc(docRef);
      
      if (snap.exists()) {
        const expense = snap.data() as Expense;
        let dateNum = expense.date as any;
        if (dateNum?.toMillis) dateNum = dateNum.toMillis();
        
        const dateObj = new Date(dateNum);
        const monthYear = `${dateObj.getFullYear()}-${(dateObj.getMonth() + 1).toString().padStart(2, '0')}`;
        const budget = await this.getBudget(monthYear);

        if (expense.useBudget === false && expense.user) {
          const personalDocRef = doc(this.firestore, `personal_expenses/${expense.user}/expenses/${id}`);
          await deleteDoc(personalDocRef);
        }
      }
      
      await deleteDoc(docRef);
    }, 'Errore durante l\'eliminazione della spesa');
  }

  async deleteRecurringExpense(id: string) {
    return this.notificationService.runWithRetry(async () => {
      const docRef = doc(this.firestore, `recurring_expenses/${id}`);
      await deleteDoc(docRef);
    }, 'Errore durante l\'eliminazione della spesa ricorrente');
  }

  // --- PERSONAL EXPENSES ---
  getPersonalExpenses(monthYear: string, user: 'Angelo' | 'Daiana'): Observable<Expense[]> {
    const [year, month] = monthYear.split('-').map(Number);
    const start = Timestamp.fromDate(new Date(year, month - 1, 1));
    const end = Timestamp.fromDate(new Date(year, month, 1));

    const colRef = collection(this.firestore, `personal_expenses/${user}/expenses`);
    const q = query(
      colRef, 
      where('date', '>=', start), 
      where('date', '<', end)
    );
    return collectionData(q, { idField: 'id' }).pipe(
      map(data => {
        return (data as any[]).map(e => {
          let dateNum = e.date;
          if (e.date && typeof e.date.toMillis === 'function') {
            dateNum = e.date.toMillis();
          }
          return { ...e, date: dateNum } as Expense;
        }).sort((a, b) => b.date - a.date);
      })
    );
  }

  async addPersonalExpense(user: 'Angelo' | 'Daiana', expense: Expense) {
    const colRef = collection(this.firestore, `personal_expenses/${user}/expenses`);
    const newDocRef = doc(colRef);
    return this.notificationService.runWithRetry(async () => {
      const dataToSave = {
        ...expense,
        date: Timestamp.fromMillis(expense.date)
      };
      await setDoc(newDocRef, dataToSave);
    }, 'Errore durante l\'aggiunta della spesa personale');
  }

  async updatePersonalExpense(user: 'Angelo' | 'Daiana', expense: Expense) {
    if (!expense.id) return;
    return this.notificationService.runWithRetry(async () => {
      const docRef = doc(this.firestore, `personal_expenses/${user}/expenses/${expense.id}`);
      const dataToSave = {
        ...expense,
        date: Timestamp.fromMillis(expense.date)
      };
      await setDoc(docRef, dataToSave, { merge: true });
      // Non tocca mai la collezione 'expenses' condivisa
    }, 'Errore durante la modifica della spesa personale');
  }

  async deletePersonalExpense(user: 'Angelo' | 'Daiana', id: string) {
    return this.notificationService.runWithRetry(async () => {
      const docRef = doc(this.firestore, `personal_expenses/${user}/expenses/${id}`);
      await deleteDoc(docRef);

      const sharedDocRef = doc(this.firestore, `expenses/${id}`);
      const sharedSnap = await getDoc(sharedDocRef);
      if (sharedSnap.exists()) {
        await deleteDoc(sharedDocRef);
      }
    }, 'Errore durante l\'eliminazione della spesa personale');
  }

  // --- CATEGORIES ---
  getCategories(): Observable<string[]> {
    const docRef = doc(this.firestore, 'finance/config');
    return docData(docRef).pipe(
      map(data => {
        if (data && data['categories']) {
          return data['categories'] as string[];
        }
        return FINANCE_CATEGORIES; // Fallback
      })
    );
  }

  async saveCategories(categories: string[]) {
    return this.notificationService.runWithRetry(async () => {
      const docRef = doc(this.firestore, 'finance/config');
      await setDoc(docRef, { categories }, { merge: true });
    }, 'Errore durante il salvataggio delle categorie');
  }

  // --- INITIALIZATION ---
  async initializeMonth(monthYear: string) {
    // 1. Verifica se il budget esiste
    let budget = await this.getBudget(monthYear);
    if (!budget) {
      // Crea budget di default
      const newBudget: Budget = {
        monthYear,
        totalLiquid: 1200,
        totalVouchers: 100
      };
      await this.saveBudget(newBudget);
      
      // 2. Carica spese ricorrenti
      const { take } = await import('rxjs/operators');
      const recurring = await new Promise<RecurringExpense[]>((resolve) => {
        this.getRecurringExpenses().pipe(take(1)).subscribe(data => resolve(data));
      });

      // 3. Aggiungi le spese ricorrenti come spese effettive per questo mese
      for (const rec of recurring) {
        const [year, month] = monthYear.split('-').map(Number);
        const date = new Date(year, month - 1, 1, 10, 0, 0).getTime();
        
        await this.addExpense({
          totalAmount: rec.amount,
          liquidAmount: rec.method === 'liquid' ? rec.amount : 0,
          voucherAmount: rec.method === 'voucher' ? rec.amount : 0,
          vouchersUsed: rec.method === 'voucher' ? Math.ceil(rec.amount / 5) : 0,
          category: rec.category,
          date,
          note: `Ricorrente: ${rec.name}`,
          useBudget: rec.useBudget !== false
        });
      }
    }
  }
}
