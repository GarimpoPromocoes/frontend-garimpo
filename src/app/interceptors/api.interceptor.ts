import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { AuthService } from '../services/auth.service';

// Unico lugar que sabe sobre apiBase/token — o resto do app so chama
// this.http.get('/api/...') igual sempre chamou, local ou na Vercel.
// O token agora e' o do usuario logado (ver AuthService), nao mais uma
// chave fixa do bundle.
export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/')) return next(req);

  const auth = inject(AuthService);
  const url = environment.apiBase ? `${environment.apiBase}${req.url}` : req.url;
  const token = auth.obterToken();

  const clonado = token
    ? req.clone({ url, setHeaders: { Authorization: `Bearer ${token}` } })
    : req.clone({ url });

  return next(clonado);
};
