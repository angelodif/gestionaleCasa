import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { PizzaTimerService } from './pizza-timer.service';

@Component({
  selector: 'app-pizza-recipe-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatButtonModule,
    MatIconModule, MatFormFieldModule, MatInputModule, MatDividerModule, MatTooltipModule
  ],
  templateUrl: './pizza-recipe-dialog.component.html',
  styleUrl: './pizza-recipe-dialog.component.scss'
})
export class PizzaRecipeDialogComponent implements OnInit {
  numPizzas: number = 2;

  baseDoses = { flour: 250, water: 175, salt: 6, yeast: 1 };
  ingredients = { ...this.baseDoses };

  // Expose service directly to template
  timer: PizzaTimerService;

  constructor(
    public dialogRef: MatDialogRef<PizzaRecipeDialogComponent>,
    timerService: PizzaTimerService
  ) {
    this.timer = timerService;
  }

  ngOnInit() {
    this.updateIngredients();
    this.timer.requestPermission();
  }

  updateIngredients() {
    const factor = this.numPizzas / 2;
    this.ingredients.flour = Math.round(this.baseDoses.flour * factor);
    this.ingredients.water = Math.round(this.baseDoses.water * factor);
    this.ingredients.salt  = Number((this.baseDoses.salt  * factor).toFixed(1));
    this.ingredients.yeast = Number((this.baseDoses.yeast * factor).toFixed(1));
  }
}
