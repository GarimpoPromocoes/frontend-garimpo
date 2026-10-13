import { ApplicationConfig, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { apiInterceptor } from './core/http/api.interceptor';
import { iniciarFocoDasJanelas } from './core/a11y/foco-janelas';
import { iniciarTema } from './core/tema/tema';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch(), withInterceptors([apiInterceptor])),
    provideAppInitializer(iniciarFocoDasJanelas),
    provideAppInitializer(iniciarTema),
  ],
};
