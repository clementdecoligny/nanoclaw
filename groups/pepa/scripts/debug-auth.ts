import { authCookies } from '../../extra/continente/auth.js';

const cookie = await authCookies();
console.log('Auth success, cookie length:', cookie.length);
console.log('Cookie preview:', cookie.substring(0, 50) + '...');

// Now try to fetch order history page
const res = await fetch('https://www.continente.pt/area-pessoal/encomendas/historico-de-encomendas/', {
  headers: {
    Cookie: cookie,
    Accept: 'text/html,application/xhtml+xml',
    'Accept-Language': 'pt-PT,pt;q=0.9',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
  }
});
console.log('Status:', res.status, res.statusText);
console.log('Redirect:', res.url);
const text = await res.text();
console.log('Body length:', text.length);
console.log('Body preview:', text.substring(0, 500));
