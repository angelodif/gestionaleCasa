import { Component, inject, OnInit, OnDestroy, signal, computed, effect, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, registerLocaleData } from '@angular/common';
import localeIt from '@angular/common/locales/it';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatChipsModule } from '@angular/material/chips';
import { MealService, DayPlan, Meal, SnacksPlan } from '../../services/meal/meal.service';
import { DietService, DietFoodItem } from '../../services/diet/diet.service';
import { ShiftService } from '../../services/shift/shift.service';
import { ShoppingListService } from '../../services/shopping/shopping.service';
import { AddItemDialogComponent } from '../../shared/add-item-dialog/add-item-dialog.component';
import { Router } from '@angular/router';
import { NotificationService } from '../../services/notification/notification.service';
import { PushNotificationService } from '../../services/push-notification/push-notification.service';
import { firstValueFrom, Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

registerLocaleData(localeIt);

type MealType = 'lunch' | 'dinner';

@Component({
  selector: 'app-meal-planner',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatInputModule, 
    MatButtonModule, MatIconModule, MatDividerModule, MatSnackBarModule, MatDialogModule,
    MatTooltipModule, MatSlideToggleModule, MatAutocompleteModule, MatChipsModule
  ],
  templateUrl: './meal-planner.component.html',
  styleUrl: './meal-planner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MealPlannerComponent implements OnInit, OnDestroy {
  private mealService = inject(MealService);
  private dietService = inject(DietService);
  private shiftService = inject(ShiftService);
  private shoppingService = inject(ShoppingListService);
  private dialog = inject(MatDialog);
  private router = inject(Router);
  private notification = inject(NotificationService);
  private pushNotificationService = inject(PushNotificationService);

  // Signals State
  currentDate = signal<Date>(new Date());
  allDaysPlans = signal<{ [key: string]: DayPlan }>({});
  isSplit = signal<{ [key: string]: { lunch: boolean, dinner: boolean, snacks?: boolean } }>({});
  weekShifts = signal<{ [key: string]: any }>({});
  days = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
  hasScroll = signal<boolean>(false);

  // Diet Mode State
  isDietMode = signal<boolean>(false);
  allDietFoods = signal<DietFoodItem[]>([]);
  carbOptions = computed(() => this.allDietFoods().filter(f => f.category === 'carbs'));
  proteinOptions = computed(() => this.allDietFoods().filter(f => f.category === 'proteins'));
  fiberOptions = computed(() => this.allDietFoods().filter(f => f.category === 'fibers'));
  snackOptions = computed(() => this.allDietFoods().filter(f => f.category === 'snacks'));

  getFilteredCarbs(query?: string | null): DietFoodItem[] {
    const list = this.carbOptions();
    if (!query || !query.trim()) return list;
    const q = query.trim().toLowerCase();
    return list.filter(item => item.name.toLowerCase().includes(q));
  }

  getFilteredProteins(query?: string | null): DietFoodItem[] {
    const list = this.proteinOptions();
    if (!query || !query.trim()) return list;
    const q = query.trim().toLowerCase();
    return list.filter(item => item.name.toLowerCase().includes(q));
  }

  getFilteredFibers(query?: string | null): DietFoodItem[] {
    const list = this.fiberOptions();
    if (!query || !query.trim()) return list;
    const q = query.trim().toLowerCase();
    return list.filter(item => item.name.toLowerCase().includes(q));
  }

  getFilteredSnacks(query?: string | null): DietFoodItem[] {
    const list = this.snackOptions();
    if (!query || !query.trim()) return list;
    const q = query.trim().toLowerCase();
    return list.filter(item => item.name.toLowerCase().includes(q));
  }

  // Temporary input for snacks
  newSnackInput = signal<{ [key: string]: { morningA: string, morningD: string, afternoonA: string, afternoonD: string } }>({});

  // Computed Signals
  weekId = computed(() => {
    const d = new Date(this.currentDate().getTime());
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    const week1 = new Date(d.getFullYear(), 0, 4);
    const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    return `${d.getFullYear()}-W${weekNum}`;
  });

  weekRangeLabel = computed(() => {
    const start = new Date(this.currentDate());
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1);
    const firstDay = new Date(start.setDate(diff));
    const lastDay = new Date(start.setDate(diff + 6));
    const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
    return `Dal ${firstDay.toLocaleDateString('it-IT', options)} al ${lastDay.toLocaleDateString('it-IT', options)}`;
  });

  weekDaysData = computed(() => {
    const start = new Date(this.currentDate());
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(start.setDate(diff));

    const names = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
    return names.map((name, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      return { name, date };
    });
  });

  private saveSubject = new Subject<{day: string, plan: DayPlan}>();
  private saveSub?: Subscription;
  private dietSub?: Subscription;
  private shiftsSub?: Subscription;

  constructor() {
    effect(() => {
      const id = this.weekId();
      this.loadWeekData(id);
    }, { allowSignalWrites: true });
  }

  ngOnInit() {
    this.initSaveDebounce();
    this.checkScroll();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.onResize);
    }

    // Ascolto in tempo reale dell'impostazione Dieta
    this.dietSub = this.dietService.getDietSettingsStream().subscribe(async settings => {
      this.isDietMode.set(settings.dietEnabled);
      if (settings.dietEnabled && this.allDietFoods().length === 0) {
        const foods = await this.dietService.getFoods();
        this.allDietFoods.set(foods);
      }
    });
  }

  async onToggleDietMode(enabled: boolean) {
    this.isDietMode.set(enabled);
    try {
      await this.dietService.setDietEnabled(enabled);
      if (enabled && this.allDietFoods().length === 0) {
        const foods = await this.dietService.getFoods();
        this.allDietFoods.set(foods);
      }
      this.notification.showSuccess(enabled ? 'Modalità Dieta attivata! 🥗' : 'Modalità Dieta disattivata');
    } catch {
      this.notification.showError('Errore salvataggio modalità dieta.');
    }
  }

  private onResize = () => this.checkScroll();

  checkScroll() {
    if (typeof window === 'undefined') return;
    const isMobileOrTablet = window.innerWidth <= 1200;
    const documentScrollable = document.documentElement.scrollHeight > window.innerHeight + 50;
    this.hasScroll.set(isMobileOrTablet || documentScrollable);
  }

  private initSaveDebounce() {
    this.saveSub = this.saveSubject.pipe(
      debounceTime(2000)
    ).subscribe(async ({day, plan}) => {
      try {
        await this.mealService.saveDayPlan(this.weekId(), day, plan);
        this.notification.showSuccess(`Piano ${day} salvato!`);
        this.pushNotificationService.scheduleAll();
      } catch (error: any) {}
    });
  }

  private _initialScrolled = false;

  async loadWeekData(id: string) {
    // Carica impostazione dieta
    try {
      const settings = await this.dietService.getDietSettings();
      this.isDietMode.set(settings.dietEnabled);
      if (settings.dietEnabled) {
        const foods = await this.dietService.getFoods();
        this.allDietFoods.set(foods);
      }
    } catch (e) {
      this.isDietMode.set(false);
    }

    const plans: { [key: string]: DayPlan } = {};
    const splits: { [key: string]: { lunch: boolean, dinner: boolean, snacks?: boolean } } = {};
    const snackInputs: { [key: string]: { morningA: string, morningD: string, afternoonA: string, afternoonD: string } } = {};

    for (const day of this.weekDaysData()) {
      const plan = await this.mealService.getDayPlan(id, day.name);
      plans[day.name] = plan;
      splits[day.name] = { 
        lunch: this.checkIfSplit(plan.lunch), 
        dinner: this.checkIfSplit(plan.dinner),
        snacks: this.checkIfSnacksSplit(plan.snacks)
      };
      snackInputs[day.name] = { morningA: '', morningD: '', afternoonA: '', afternoonD: '' };
    }
    
    this.allDaysPlans.set(plans);
    this.isSplit.set(splits);
    this.newSnackInput.set(snackInputs);

    // Carica e ascolta in tempo reale i turni della settimana
    if (this.shiftsSub) {
      this.shiftsSub.unsubscribe();
    }
    this.shiftsSub = this.shiftService.getWeeklyPlanner(id).subscribe({
      next: (assignments) => {
        const shiftsMap = (assignments || []).reduce((acc: any, curr: any) => {
          acc[curr.id.toLowerCase()] = curr;
          return acc;
        }, {});
        this.weekShifts.set(shiftsMap);
      },
      error: () => {
        this.weekShifts.set({});
      }
    });

    if (!this._initialScrolled && id === this.generateWeekIdStatic(new Date())) {
      this._initialScrolled = true;
      this.scrollToToday();
    }
  }

  scrollToToday() {
    if (typeof window === 'undefined') return;
    setTimeout(() => {
      this.checkScroll();
      const todayCard = document.getElementById('today-meal-card') || document.querySelector('.day-card.is-today');
      if (todayCard) {
        todayCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 150);
  }

  goToToday() {
    const today = new Date();
    if (this.generateWeekIdStatic(today) !== this.weekId()) {
      this._initialScrolled = false;
      this.currentDate.set(today);
    } else {
      this.scrollToToday();
    }
  }

  goToDietFoods() {
    this.router.navigate(['/diet-foods']);
  }

  ngOnDestroy() {
    if (this.saveSub) this.saveSub.unsubscribe();
    if (this.dietSub) this.dietSub.unsubscribe();
    if (this.shiftsSub) this.shiftsSub.unsubscribe();
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.onResize);
    }
  }

  isToday(date: Date): boolean {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  }

  changeWeek(delta: number) {
    this._initialScrolled = false;
    this.currentDate.update(d => {
      const newDate = new Date(d);
      newDate.setDate(d.getDate() + (delta * 7));
      return newDate;
    });
  }

  checkIfSplit(mealPair: { angelo: Meal, daiana: Meal }): boolean {
    if (!mealPair) return false;
    return mealPair.angelo.main !== mealPair.daiana.main || 
           mealPair.angelo.details !== mealPair.daiana.details ||
           mealPair.angelo.isOut !== mealPair.daiana.isOut ||
           !!mealPair.angelo.isCheat !== !!mealPair.daiana.isCheat ||
           mealPair.angelo.diet?.carb !== mealPair.daiana.diet?.carb ||
           mealPair.angelo.diet?.protein !== mealPair.daiana.diet?.protein ||
           mealPair.angelo.diet?.fiber !== mealPair.daiana.diet?.fiber;
  }

  checkIfSnacksSplit(snacks?: { angelo: SnacksPlan, daiana: SnacksPlan }): boolean {
    if (!snacks) return false;
    const aM = (snacks.angelo?.morning || []).join(',');
    const dM = (snacks.daiana?.morning || []).join(',');
    const aA = (snacks.angelo?.afternoon || []).join(',');
    const dA = (snacks.daiana?.afternoon || []).join(',');
    return aM !== dM || aA !== dA;
  }

  syncMeals(dayName: string, type: MealType) {
    const plans = { ...this.allDaysPlans() };
    const daySplit = this.isSplit()[dayName];
    
    if (!daySplit[type]) {
      const meal = plans[dayName][type].angelo;
      plans[dayName][type].daiana.main = meal.main;
      plans[dayName][type].daiana.details = meal.details;
      plans[dayName][type].daiana.isOut = meal.isOut;
      plans[dayName][type].daiana.isCheat = meal.isCheat;
      if (meal.diet) {
        plans[dayName][type].daiana.diet = { ...meal.diet };
      }
      this.allDaysPlans.set(plans);
    }
    this.save(dayName);
  }

  toggleCheat(dayName: string, type: 'lunch' | 'dinner', user: 'angelo' | 'daiana') {
    const plans = { ...this.allDaysPlans() };
    const meal = plans[dayName]?.[type]?.[user];
    if (meal) {
      meal.isCheat = !meal.isCheat;
      this.allDaysPlans.set(plans);
      this.syncMeals(dayName, type);
    }
  }

  toggleOut(dayName: string, type: 'lunch' | 'dinner', user: 'angelo' | 'daiana') {
    const plans = { ...this.allDaysPlans() };
    const meal = plans[dayName]?.[type]?.[user];
    if (meal) {
      meal.isOut = !meal.isOut;
      if (meal.isOut) meal.details = '';
      this.allDaysPlans.set(plans);
      this.syncMeals(dayName, type);
    }
  }

  toggleSplit(dayName: string, type: 'lunch' | 'dinner') {
    const splits = { ...this.isSplit() };
    splits[dayName][type] = !splits[dayName][type];
    this.isSplit.set(splits);
    if (!splits[dayName][type]) this.syncMeals(dayName, type);
  }

  toggleSnacksSplit(dayName: string) {
    const splits = { ...this.isSplit() };
    splits[dayName].snacks = !splits[dayName].snacks;
    this.isSplit.set(splits);
    if (!splits[dayName].snacks) {
      this.syncSnacks(dayName);
    }
  }

  syncSnacks(dayName: string) {
    const plans = { ...this.allDaysPlans() };
    const dayPlan = plans[dayName];
    if (!dayPlan || !dayPlan.snacks) return;
    dayPlan.snacks.daiana.morning = [...dayPlan.snacks.angelo.morning];
    dayPlan.snacks.daiana.afternoon = [...dayPlan.snacks.angelo.afternoon];
    this.allDaysPlans.set(plans);
    this.save(dayName);
  }

  // --- DIET AUTO-COMPLETE & GRAMS LOGIC ---
  onCarbSelected(dayName: string, type: MealType, user: 'angelo' | 'daiana', carbName: string) {
    const plans = { ...this.allDaysPlans() };
    const meal = plans[dayName]?.[type]?.[user];
    if (!meal) return;
    if (!meal.diet) meal.diet = { carb: '', carbGrams: null, protein: '', proteinGrams: null, fiber: '' };

    meal.diet.carb = carbName;
    const food = this.carbOptions().find(f => f.name.toLowerCase() === carbName.trim().toLowerCase());
    const baseGrams = type === 'lunch' ? (food?.lunchGrams ?? null) : (food?.dinnerGrams ?? null);

    // Controlla se la proteina scelta è un legume
    const isLegume = this.checkIsProteinLegume(meal.diet.protein);
    meal.diet.carbGrams = this.dietService.calculateCarbGrams(baseGrams, isLegume);

    this.allDaysPlans.set(plans);
    this.syncMeals(dayName, type);
  }

  onProteinSelected(dayName: string, type: MealType, user: 'angelo' | 'daiana', proteinName: string) {
    const plans = { ...this.allDaysPlans() };
    const meal = plans[dayName]?.[type]?.[user];
    if (!meal) return;
    if (!meal.diet) meal.diet = { carb: '', carbGrams: null, protein: '', proteinGrams: null, fiber: '' };

    meal.diet.protein = proteinName;
    const food = this.proteinOptions().find(f => f.name.toLowerCase() === proteinName.trim().toLowerCase());
    meal.diet.proteinGrams = type === 'lunch' ? (food?.lunchGrams ?? null) : (food?.dinnerGrams ?? null);

    // Se è legume ricalcola carboidrati (-20g)
    const isLegume = !!food?.isLegume || this.checkIsProteinLegume(proteinName);
    if (meal.diet.carb) {
      const carbFood = this.carbOptions().find(f => f.name.toLowerCase() === meal.diet!.carb!.trim().toLowerCase());
      const baseCarbGrams = type === 'lunch' ? (carbFood?.lunchGrams ?? null) : (carbFood?.dinnerGrams ?? null);
      meal.diet.carbGrams = this.dietService.calculateCarbGrams(baseCarbGrams, isLegume);
    }

    this.allDaysPlans.set(plans);
    this.syncMeals(dayName, type);
  }

  onFiberChanged(dayName: string, type: MealType, user: 'angelo' | 'daiana', fiberName: string) {
    const plans = { ...this.allDaysPlans() };
    const meal = plans[dayName]?.[type]?.[user];
    if (!meal) return;
    if (!meal.diet) meal.diet = { carb: '', carbGrams: null, protein: '', proteinGrams: null, fiber: '' };
    meal.diet.fiber = fiberName;
    this.allDaysPlans.set(plans);
    this.syncMeals(dayName, type);
  }

  checkIsProteinLegume(proteinName?: string | null): boolean {
    if (!proteinName) return false;
    const p = proteinName.trim().toLowerCase();
    const food = this.proteinOptions().find(f => f.name.toLowerCase() === p);
    if (food?.isLegume) return true;
    return p.includes('legum') || p.includes('lenticchie') || p.includes('ceci') || p.includes('fagioli') || p.includes('piselli');
  }

  // --- SNACKS MANAGEMENT ---
  addSnackItem(dayName: string, user: 'angelo' | 'daiana', slot: 'morning' | 'afternoon', text: string) {
    if (!text?.trim()) return;
    const val = text.trim();
    const plans = { ...this.allDaysPlans() };
    const dayPlan = plans[dayName];
    if (!dayPlan) return;
    if (!dayPlan.snacks) dayPlan.snacks = { angelo: { morning: [], afternoon: [] }, daiana: { morning: [], afternoon: [] } };

    if (!dayPlan.snacks[user][slot].includes(val)) {
      dayPlan.snacks[user][slot].push(val);
    }

    // Salva automaticamente anche nel database degli snack riutilizzabili se nuovo
    this.dietService.addFoodItem({ name: val, category: 'snacks' }).then(() => {
      this.dietService.getFoods().then(f => this.allDietFoods.set(f));
    });

    // Reset input
    const inputs = { ...this.newSnackInput() };
    const fieldKey = (slot === 'morning' ? (user === 'angelo' ? 'morningA' : 'morningD') : (user === 'angelo' ? 'afternoonA' : 'afternoonD')) as keyof typeof inputs[string];
    inputs[dayName][fieldKey] = '';
    this.newSnackInput.set(inputs);

    this.allDaysPlans.set(plans);

    // Se non è sdoppiato e modifichiamo Angelo, sincronizza Daiana
    if (!this.isSplit()[dayName]?.snacks) {
      this.syncSnacks(dayName);
    } else {
      this.save(dayName);
    }
  }

  removeSnackItem(dayName: string, user: 'angelo' | 'daiana', slot: 'morning' | 'afternoon', index: number) {
    const plans = { ...this.allDaysPlans() };
    const dayPlan = plans[dayName];
    if (!dayPlan?.snacks?.[user]?.[slot]) return;
    dayPlan.snacks[user][slot].splice(index, 1);
    this.allDaysPlans.set(plans);

    if (!this.isSplit()[dayName]?.snacks) {
      this.syncSnacks(dayName);
    } else {
      this.save(dayName);
    }
  }

  save(day: string) {
    this.saveSubject.next({ day, plan: this.allDaysPlans()[day] });
  }

  hasShiftInfo(dayName: string): boolean {
    const shift = this.weekShifts()[dayName.toLowerCase()];
    if (!shift) return false;
    const hasAngeloOffice = !!shift.angeloInOffice || (shift.angeloPresence && shift.angeloPresence !== 'home');
    const hasDaianaShift = !!shift.label;
    return hasAngeloOffice || hasDaianaShift;
  }

  getShiftTooltip(dayName: string): string {
    const shift = this.weekShifts()[dayName.toLowerCase()];
    if (!shift) return '';
    
    const lines = [];
    if (shift.label) {
      lines.push(`Daiana: ${shift.label} (${shift.startTime}-${shift.endTime}) ${shift.store || ''}`);
    }
    const presence = shift.angeloPresence || (shift.angeloInOffice ? 'office' : 'home');
    if (presence === 'office') {
      lines.push(`Angelo: In Ufficio (09:00-18:00)`);
    } else if (presence === 'office_morning') {
      lines.push(`Angelo: In Ufficio Mattina (09:00-13:00)`);
    } else if (presence === 'office_afternoon') {
      lines.push(`Angelo: In Ufficio Pomeriggio (14:00-18:00)`);
    }
    return lines.join(' • ');
  }

  addToList(text: string) {
    if (!text?.trim()) return;
    const dialogRef = this.dialog.open(AddItemDialogComponent, {
      width: '90vw',
      maxWidth: '400px',
      data: { itemName: text }
    });

    dialogRef.afterClosed().subscribe(async result => {
      if (result && result.itemName) {
        try {
          await this.shoppingService.addItemToShoppingListAndConfig(result.itemName, result.shopName);
          this.notification.showSuccess(`"${result.itemName}" aggiunto in ${result.shopName}!`);
        } catch (error: any) {}
      }
    });
  }

  private generateWeekIdStatic(d: Date): string {
    const date = new Date(d.getTime());
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    const week1 = new Date(date.getFullYear(), 0, 4);
    const weekNum = 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    return `${date.getFullYear()}-W${weekNum}`;
  }

  isPastWeek(): boolean {
    const lastDay = this.weekDaysData()[6]?.date;
    if (!lastDay) return false;
    const end = new Date(lastDay);
    end.setHours(23, 59, 59, 999);
    return end < new Date();
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }
}