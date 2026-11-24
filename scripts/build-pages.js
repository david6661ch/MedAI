import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { getPages, getNavigation, notFoundPage } from '../models/pageModel.js';
import { renderPage } from '../views/render.js';

const pages = getPages();
const fileFor = page => page.path === '/' ? 'index.html' : page.view + '.html';
const routes = new Map(pages.map(page => [page.path, fileFor(page)]));
const assets = [
    'css/output.css',
    'css/styles.css',
    'css/vendor/bootstrap.min.css',
    'css/vendor/TAILWIND-LICENSE.txt',
    'img/logo.svg',
    'js/composer.js',
    'js/app.js',
    'js/audio.js',
    'js/ethics.js',
    'js/api-config.js'
];
const navigation = {
    primary: getNavigation('primary'),
    secondary: getNavigation('secondary'),
    utility: getNavigation('utility')
};
const destination = new URL('../docs/', import.meta.url);
await mkdir(destination, { recursive: true });

for (const asset of assets) {
    const target = new URL(asset, destination);
    await mkdir(new URL('.', target), { recursive: true });
    await copyFile(new URL('../public/' + asset, import.meta.url), target);
}

// Solo la URL pública del backend; nunca secretos ni claves.
const apiBase=process.env.MEDAI_PUBLIC_API_BASE?.trim();
if(apiBase){
    const url=new URL(apiBase);
    if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('MEDAI_PUBLIC_API_BASE debe ser un origen HTTPS sin ruta ni credenciales.');
    await writeFile(new URL('js/api-config.js',destination),'// Origen público generado por GitHub Actions.\nexport const API_BASE = '+JSON.stringify(url.origin)+';\n','utf8');
}

for (const page of [...pages, notFoundPage]) {
    const prefix = page.view === '404' ? '/MedAI/' : './';
    const html = renderPage(page, navigation).replace(/(href|src)="(\/[^"]*)"/g, (_, attribute, path) => {
        const target = routes.get(path) ?? (assets.includes(path.slice(1)) ? path.slice(1) : null);
        if (!target) throw new Error('Ruta desconocida: ' + path);
        return attribute + '="' + prefix + target + '"';
    });
    if (/\{\{\w+\}\}/.test(html)) throw new Error('Plantilla sin procesar: ' + page.view);
    await writeFile(new URL(fileFor(page), destination), html, 'utf8');
}
await writeFile(new URL('.nojekyll', destination), '');
console.log('GitHub Pages: ' + (pages.length + 1) + ' vistas exportadas a docs/.');
