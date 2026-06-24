import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import {
  ConfirmDialogComponent,
  ConfirmDialogData
} from '../../shared/confirm-dialog/confirm-dialog.component';

@Injectable({
  providedIn: 'root'
})
export class ConfirmService {
  private dialog = inject(MatDialog);

  /**
   * Apre un dialog di conferma e restituisce true se l'utente clicca
   * su Conferma, false se annulla o chiude la dialog.
   */
  async confirm(data: ConfirmDialogData): Promise<boolean> {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data,
      width: '360px',
      maxWidth: '95vw',
      disableClose: false
    });
    const result = await firstValueFrom(ref.afterClosed());
    return result === true;
  }
}
