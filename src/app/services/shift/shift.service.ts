import { inject, Injectable } from '@angular/core';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root'
})
export class ShiftService {
  private firestore = inject(Firestore);

  async getAssignmentByDay(weekId: string, dayId: string) {
    const docRef = doc(this.firestore, `planners/${weekId}/assignments`, dayId);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() : null;
  }
}