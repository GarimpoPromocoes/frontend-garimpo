import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ConfigService } from './services/config.service';
import { StatusService } from './services/status.service';
import { ConnectionCard } from './components/connection-card/connection-card';
import { PostingConfigCard } from './components/posting-config-card/posting-config-card';
import { ThemesCard } from './components/themes-card/themes-card';
import { GroupsCard } from './components/groups-card/groups-card';
import { RunCard } from './components/run-card/run-card';
import { StatsCard } from './components/stats-card/stats-card';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ConnectionCard, PostingConfigCard, ThemesCard, GroupsCard, RunCard, StatsCard],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit, OnDestroy {
  protected statusService = inject(StatusService);
  protected configService = inject(ConfigService);

  ngOnInit(): void {
    this.configService.carregar();
    this.statusService.iniciarPolling();
  }

  ngOnDestroy(): void {
    this.statusService.pararPolling();
  }
}
