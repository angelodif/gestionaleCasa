import { Injectable, inject } from '@angular/core';
import { Firestore, collection, doc, docData, setDoc, getDoc, getDocs, collectionData, query, orderBy, where, addDoc, updateDoc, deleteDoc, Timestamp } from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';
import { NotificationService } from '../notification/notification.service';
import { CacheService } from '../../core/services/cache/cache.service';

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
  'Spese Mediche',
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
  'Spese Mediche': 'local_hospital',
  'Personale': 'person',
  'Casa (Affitto/Mutuo)': 'home',
  'Bollette': 'receipt_long',
  'Altro': 'more_horiz'
};

@Injectable({ providedIn: 'root' })
export class FinanceService {
  private firestore = inject(Firestore);
  private notificationService = inject(NotificationService);
  private cacheService = inject(CacheService);

  // ── BUDGET ────────────────────────────────────────────────────────────────

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

  // ── EXPENSES ──────────────────────────────────────────────────────────────

  /**
   * Restituisce tutte le spese dalla cache locale se valida,
   * altrimenti da Firestore.
   */
  getAllExpenses(): Observable<Expense[]> {
    const colRef = collection(this.firestore, 'expenses');
    const source$ = collectionData(colRef, { idField: 'id' }).pipe(
      map(data => (data as any[]).map(e => {
        let dateNum = e.date;
        if (e.date && typeof e.date.toMillis === 'function') dateNum = e.date.toMillis();
        return { ...e, date: dateNum } as Expense;
      }))
    );
    return this.cacheService.getCachedCollection<Expense[]>('expenses_all', source$);
  }

  /**
   * Restituisce le spese mensili dalla cache locale se valida.
   * La chiave include il mese per isolare le cache per mese.
   */
  getMonthlyExpenses(monthYear: string): Observable<Expense[]> {
    const [year, month] = monthYear.split('-').map(Number);
    const start = Timestamp.fromDate(new Date(year, month - 1, 1));
    const end   = Timestamp.fromDate(new Date(year, month, 1));

    const colRef = collection(this.firestore, 'expenses');
    const q = query(colRef, where('date', '>=', start), where('date', '<', end));
    const source$ = collectionData(q, { idField: 'id' }).pipe(
      map(data => (data as any[]).map(e => {
        let dateNum = e.date;
        if (e.date && typeof e.date.toMillis === 'function') dateNum = e.date.toMillis();
        return { ...e, date: dateNum } as Expense;
      }).sort((a, b) => b.date - a.date))
    );

    return this.cacheService.getCachedCollection<Expense[]>(`expenses_${monthYear}`, source$);
  }

  async addExpense(expense: Expense) {
    const colRef = collection(this.firestore, 'expenses');
    const newDocRef = doc(colRef);

    return this.notificationService.runWithRetry(async () => {
      const dataToSave = { ...expense, date: Timestamp.fromMillis(expense.date) };
      await setDoc(newDocRef, dataToSave);

      if (expense.useBudget === false && expense.user) {
        const personalColRef = collection(this.firestore, `personal_expenses/${expense.user}/expenses`);
        const personalDocRef = doc(personalColRef, newDocRef.id);
        await setDoc(personalDocRef, dataToSave);
      }

      const dateObj = new Date(expense.date);
      const monthYear = `${dateObj.getFullYear()}-${(dateObj.getMonth() + 1).toString().padStart(2, '0')}`;
      await this.getBudget(monthYear);

      // Invalida la cache del mese specifico e quella globale
      this.cacheService.clearCacheEntry(`expenses_${monthYear}`);
      this.cacheService.clearCacheEntry('expenses_all');
    }, 'Errore durante l\'aggiunta della spesa');
  }

  // ── RECURRING EXPENSES ────────────────────────────────────────────────────

  /**
   * Restituisce le spese ricorrenti dalla cache locale se valida.
   */
  getRecurringExpenses(): Observable<RecurringExpense[]> {
    const colRef = collection(this.firestore, 'recurring_expenses');
    const source$ = collectionData(colRef, { idField: 'id' }) as Observable<RecurringExpense[]>;
    return this.cacheService.getCachedCollection<RecurringExpense[]>('recurring_expenses', source$);
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
      this.cacheService.clearCacheEntry('recurring_expenses');
    }, 'Errore durante il salvataggio della spesa ricorrente');
  }

  getRangeExpenses(startMonthYear: string, endMonthYear: string): Observable<Expense[]> {
    const [sYear, sMonth] = startMonthYear.split('-').map(Number);
    const [eYear, eMonth] = endMonthYear.split('-').map(Number);
    const start = Timestamp.fromDate(new Date(sYear, sMonth - 1, 1));
    const end   = Timestamp.fromDate(new Date(eYear, eMonth, 1));

    const colRef = collection(this.firestore, 'expenses');
    const q = query(colRef, where('date', '>=', start), where('date', '<', end));
    const source$ = collectionData(q, { idField: 'id' }).pipe(
      map(data => (data as any[]).map(e => ({
        ...e,
        date: e.date?.toMillis ? e.date.toMillis() : e.date
      }) as Expense))
    );
    return this.cacheService.getCachedCollection<Expense[]>(
      `expenses_range_${startMonthYear}_${endMonthYear}`,
      source$
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
      const dataToSave = { ...expense, date: Timestamp.fromMillis(expense.date) };
      await setDoc(docRef, dataToSave, { merge: true });

      if (expense.useBudget === false && expense.user) {
        const personalDocRef = doc(this.firestore, `personal_expenses/${expense.user}/expenses/${expense.id}`);
        await setDoc(personalDocRef, dataToSave, { merge: true });
      }

      const dateObj = new Date(expense.date);
      const monthYear = `${dateObj.getFullYear()}-${(dateObj.getMonth() + 1).toString().padStart(2, '0')}`;
      this.cacheService.clearCacheEntry(`expenses_${monthYear}`);
      this.cacheService.clearCacheEntry('expenses_all');
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
        await this.getBudget(monthYear);

        if (expense.useBudget === false && expense.user) {
          const personalDocRef = doc(this.firestore, `personal_expenses/${expense.user}/expenses/${id}`);
          await deleteDoc(personalDocRef);
        }

        // Elimina prima il documento su Firestore, poi invalida la cache
        // (in modo che il refresh trovi il dato già assente)
        await deleteDoc(docRef);

        this.cacheService.clearCacheEntry(`expenses_${monthYear}`);
        this.cacheService.clearCacheEntry('expenses_all');
        return;
      }

      await deleteDoc(docRef);
    }, 'Errore durante l\'eliminazione della spesa');
  }

  async deleteRecurringExpense(id: string) {
    return this.notificationService.runWithRetry(async () => {
      const docRef = doc(this.firestore, `recurring_expenses/${id}`);
      await deleteDoc(docRef);
      this.cacheService.clearCacheEntry('recurring_expenses');
    }, 'Errore durante l\'eliminazione della spesa ricorrente');
  }

  // ── PERSONAL EXPENSES ─────────────────────────────────────────────────────

  getPersonalExpenses(monthYear: string, user: 'Angelo' | 'Daiana'): Observable<Expense[]> {
    const [year, month] = monthYear.split('-').map(Number);
    const start = Timestamp.fromDate(new Date(year, month - 1, 1));
    const end   = Timestamp.fromDate(new Date(year, month, 1));

    const colRef = collection(this.firestore, `personal_expenses/${user}/expenses`);
    const q = query(colRef, where('date', '>=', start), where('date', '<', end));
    const source$ = collectionData(q, { idField: 'id' }).pipe(
      map(data => (data as any[]).map(e => {
        let dateNum = e.date;
        if (e.date && typeof e.date.toMillis === 'function') dateNum = e.date.toMillis();
        return { ...e, date: dateNum } as Expense;
      }).sort((a, b) => b.date - a.date))
    );

    return this.cacheService.getCachedCollection<Expense[]>(
      `personal_expenses_${user}_${monthYear}`,
      source$
    );
  }

  async addPersonalExpense(user: 'Angelo' | 'Daiana', expense: Expense) {
    const colRef = collection(this.firestore, `personal_expenses/${user}/expenses`);
    const newDocRef = doc(colRef);
    return this.notificationService.runWithRetry(async () => {
      const dataToSave = { ...expense, date: Timestamp.fromMillis(expense.date) };
      await setDoc(newDocRef, dataToSave);

      const dateObj = new Date(expense.date);
      const monthYear = `${dateObj.getFullYear()}-${(dateObj.getMonth() + 1).toString().padStart(2, '0')}`;
      this.cacheService.clearCacheEntry(`personal_expenses_${user}_${monthYear}`);
    }, 'Errore durante l\'aggiunta della spesa personale');
  }

  async updatePersonalExpense(user: 'Angelo' | 'Daiana', expense: Expense) {
    if (!expense.id) return;
    return this.notificationService.runWithRetry(async () => {
      const docRef = doc(this.firestore, `personal_expenses/${user}/expenses/${expense.id}`);
      const dataToSave = { ...expense, date: Timestamp.fromMillis(expense.date) };
      await setDoc(docRef, dataToSave, { merge: true });

      const dateObj = new Date(expense.date);
      const monthYear = `${dateObj.getFullYear()}-${(dateObj.getMonth() + 1).toString().padStart(2, '0')}`;
      this.cacheService.clearCacheEntry(`personal_expenses_${user}_${monthYear}`);
    }, 'Errore durante la modifica della spesa personale');
  }

  async deletePersonalExpense(user: 'Angelo' | 'Daiana', id: string) {
    return this.notificationService.runWithRetry(async () => {
      const docRef = doc(this.firestore, `personal_expenses/${user}/expenses/${id}`);
      await deleteDoc(docRef);

      const sharedDocRef = doc(this.firestore, `expenses/${id}`);
      const sharedSnap = await getDoc(sharedDocRef);
      if (sharedSnap.exists()) await deleteDoc(sharedDocRef);

      // Non possiamo conoscere il mese senza leggere il doc prima — invalidiamo tutto
      this.cacheService.clearCacheEntry('expenses_all');
    }, 'Errore durante l\'eliminazione della spesa personale');
  }

  // ── CATEGORIES ────────────────────────────────────────────────────────────

  /**
   * Restituisce le categorie finanza dalla cache locale se valida.
   */
  getCategories(): Observable<string[]> {
    const docRef = doc(this.firestore, 'finance/config');
    const source$ = docData(docRef).pipe(
      map(data => {
        if (data && data['categories']) return data['categories'] as string[];
        return FINANCE_CATEGORIES;
      })
    );
    return this.cacheService.getCachedCollection<string[]>('finance_categories', source$);
  }

  async saveCategories(categories: string[]) {
    return this.notificationService.runWithRetry(async () => {
      const docRef = doc(this.firestore, 'finance/config');
      await setDoc(docRef, { categories }, { merge: true });
      this.cacheService.clearCacheEntry('finance_categories');
    }, 'Errore durante il salvataggio delle categorie');
  }

  // ── INITIALIZATION ────────────────────────────────────────────────────────

  async initializeMonth(monthYear: string) {
    let budget = await this.getBudget(monthYear);
    if (!budget) {
      const newBudget: Budget = { monthYear, totalLiquid: 1200, totalVouchers: 100 };
      await this.saveBudget(newBudget);

      const { take } = await import('rxjs/operators');
      const recurring = await new Promise<RecurringExpense[]>((resolve) => {
        this.getRecurringExpenses().pipe(take(1)).subscribe(data => resolve(data));
      });

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
