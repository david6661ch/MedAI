// Enrutador: distingue las peticiones de páginas de los recursos estáticos.
import { readFile } from 'node:fs/promises';
import { showPage } from '../controllers/pageController.js';
import { handleApi } from '../controllers/apiController.js';

// Solo se sirven recursos públicos conocidos, no archivos del servidor.
const assets = new Map([
    ['/css/styles.css', 'text/css; charset=utf-8'],
    ['/css/output.css', 'text/css; charset=utf-8'],
    ['/css/vendor/bootstrap.min.css', 'text/css; charset=utf-8'],
    ['/img/logo.svg', 'image/svg+xml'],
    ['/js/composer.js', 'text/javascript; charset=utf-8'],
    ['/js/app.js', 'text/javascript; charset=utf-8'],
    ['/js/api-config.js', 'text/javascript; charset=utf-8']
]);

export async function route(request, response) {
    const apiPath = new URL(request.url, 'http://localhost').pathname;
    if (apiPath.startsWith('/api/')) return handleApi(request, response, apiPath);
    if (!['GET', 'HEAD'].includes(request.method)) {
        response.writeHead(405, { Allow: 'GET, HEAD' });
        response.end();
        return;
    }
    const path = new URL(request.url, 'http://localhost').pathname.replace(/\/$/, '') || '/';
    const headOnly = request.method === 'HEAD';
    if (assets.has(path)) {
        const data = await readFile(new URL(`../public${path}`, import.meta.url));
        response.writeHead(200, { 'Content-Type': assets.get(path) });
        response.end(headOnly ? undefined : data);
        return;
    }
    showPage(path, response, headOnly);
}
