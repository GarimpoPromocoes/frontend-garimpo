import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../environments/environment';

// Unico lugar que sabe sobre apiBase/apiToken — o resto do app so chama
// this.http.get('/api/...') igual sempre chamou, local ou na Vercel.
export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/')) return next(req);

  const url = environment.apiBase ? `${environment.apiBase}${req.url}` : req.url;
  const clonado = environment.apiToken
    ? req.clone({ url, setHeaders: { 'X-Api-Key': environment.apiToken } })
    : req.clone({ url });

  return next(clonado);
};
