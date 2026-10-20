import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDialogModule } from '@angular/material/dialog';
import { DietService, DietFoodItem } from '../../services/diet/diet.service';
import { NotificationService } from '../../services/notification/notification.service';
import { ConfirmService } from '../../services/confirm/confirm.service';

@Component({
  selector: 'app-diet-foods',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatButtonModule,
    MatIconModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatCheckboxModule, MatChipsModule, MatTabsModule, MatDialogModule
  ],
  templateUrl: './diet-foods.component.html',
  styleUrl: './diet-foods.component.scss'
})
export class DietFoodsComponent implements OnInit {
  private dietService = inject(DietService);
  private notification = inject(NotificationService);
  private confirmService = inject(ConfirmService);
  private router = inject(Router);

  foods = signal<DietFoodItem[]>([]);
  activeTab = signal<'carbs' | 'proteins' | 'fibers' | 'snacks'>('carbs');
  searchQuery = signal<string>('');

  // Form nuovo alimento
  newName = '';
  newCategory: 'carbs' | 'proteins' | 'fibers' | 'snacks' = 'carbs';
  newLunchGrams: number | null = null;
  newDinnerGrams: number | null = null;
  newIsLegume = false;

  filteredFoods = computed(() => {
    const cat = this.activeTab();
    const query = this.searchQuery().toLowerCase().trim();
    return this.foods()
      .filter(f => f.category === cat)
      .filter(f => !query || f.name.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  async ngOnInit() {
    await this.loadFoods();
  }

  async loadFoods() {
    const list = await this.dietService.getFoods();
    this.foods.set(list);
  }

  setCategoryTab(index: number) {
    const cats: ('carbs' | 'proteins' | 'fibers' | 'snacks')[] = ['carbs', 'proteins', 'fibers', 'snacks'];
    this.activeTab.set(cats[index]);
    this.newCategory = cats[index];
    this.resetForm();
  }

  resetForm() {
    this.newName = '';
    this.newLunchGrams = null;
    this.newDinnerGrams = null;
    this.newIsLegume = false;
  }

  async addFood() {
    if (!this.newName.trim()) {
      this.notification.showInfo('Inserisci il nome dell\'alimento');
      return;
    }

    try {
      await this.dietService.addFoodItem({
        name: this.newName.trim(),
        category: this.newCategory,
        lunchGrams: (this.newCategory === 'carbs' || this.newCategory === 'proteins') ? this.newLunchGrams : null,
        dinnerGrams: (this.newCategory === 'carbs' || this.newCategory === 'proteins') ? this.newDinnerGrams : null,
        isLegume: this.newCategory === 'proteins' ? this.newIsLegume : false
      });
      this.notification.showSuccess('Alimento salvato su Firebase!');
      this.resetForm();
      await this.loadFoods();
    } catch {
      this.notification.showError('Errore durante il salvataggio.');
    }
  }

  async deleteFood(food: DietFoodItem) {
    const ok = await this.confirmService.confirm({
      title: 'Elimina alimento',
      message: `Sei sicuro di voler eliminare "${food.name}" dalla lista degli alimenti?`,
      confirmLabel: 'Elimina',
      danger: true
    });
    if (!ok) return;

    try {
      await this.dietService.removeFoodItem(food.id);
      this.notification.showSuccess('Alimento eliminato!');
      await this.loadFoods();
    } catch {
      this.notification.showError('Errore durante l\'eliminazione.');
    }
  }

  goBack() {
    this.router.navigate(['/meal-planner']);
  }
}
