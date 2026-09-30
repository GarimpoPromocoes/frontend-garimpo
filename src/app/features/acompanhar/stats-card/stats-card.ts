import { Component, inject } from '@angular/core';
import { StatusService } from '../../../core/services/status.service';

@Component({
  selector: 'app-stats-card',
  standalone: true,
  templateUrl: './stats-card.html',
})
export class StatsCard {
  protected statusService = inject(StatusService);
}
