// Path: src/app/components/dialogs/create-apartment-dialog/create-apartment-dialog.ts

import { Component, input, output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  BuildingInfo,
  LegalStatus,
  PrimaryUse,
  LEGAL_STATUS_DISPLAY,
  PRIMARY_USE_DISPLAY
} from '../../../models/building-info.model';
import { Apartment } from '../../../services/cityjson.model';

export interface CreateApartmentResult {
  apartment: Apartment | null;
  confirmed: boolean;
}

@Component({
  selector: 'app-create-apartment-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './create-apartment-dialog.html',
  styleUrls: ['./create-apartment-dialog.css']
})
export class CreateApartmentDialog {
  // Inputs
  isOpen = input<boolean>(false);
  buildingInfo = input<BuildingInfo | null>(null);
  selectedRooms = input<string[]>([]);

  // Outputs
  dialogClose = output<CreateApartmentResult>();

  // Computed
  selectedRoomNames = computed(() => {
    const rooms = this.selectedRooms();
    if (rooms.length === 0) return 'None selected';
    if (rooms.length <= 3) return rooms.join(', ');
    return `${rooms.slice(0, 3).join(', ')} (+${rooms.length - 3} more)`;
  });

  onCancel(): void {
    this.dialogClose.emit({ apartment: null, confirmed: false });
  }

  onSave(): void {
    const rooms = this.selectedRooms();
    if (rooms.length === 0) {
      return;
    }

    const apartment: Apartment = {
      apartment_id: `Apt-${Date.now().toString(36).toUpperCase()}`,
      rooms: rooms
    };

    this.dialogClose.emit({ apartment, confirmed: true });
  }

  getLegalStatusDisplay(code: LegalStatus | undefined): string {
    if (!code) return 'N/A';
    return LEGAL_STATUS_DISPLAY[code] || code;
  }

  getPrimaryUseDisplay(code: PrimaryUse | undefined): string {
    if (!code) return 'N/A';
    return PRIMARY_USE_DISPLAY[code] || code;
  }
}
