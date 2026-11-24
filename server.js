import { createServer } from 'node:http';
import { loadEnvFile } from 'node:process';
import { getProviders } from './services/providerConfig.js';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { route } from './routes/pageRoutes.js';

export const server = createServer(async (request, response) => {
    try {
        await route(request, response);
    } catch (error) {
        console.error(error.message);
        if (!response.headersSent) response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('No se pudo cargar la página.');
    }
});

// Abre el navegador predeterminado sin instalar dependencias adicionales.
function openBrowser(url) {
    const commands = {
        win32: ['rundll32.exe', ['url.dll,FileProtocolHandler', url]],
        darwin: ['open', [url]],
        linux: ['xdg-open', [url]]
    };
    const command = commands[process.platform];
    if (!command) {
        console.log('Abre manualmente: ' + url);
        return;
    }

    const [program, args] = command;
    const child = spawn(program, args, { stdio: 'ignore', windowsHide: true });
    child.on('error', () => console.log('No se pudo abrir el navegador. Accede a ' + url));
    child.on('exit', code => {
        if (code !== 0) console.log('Abre manualmente: ' + url);
    });
    child.unref();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try { loadEnvFile(new URL('./.env', import.meta.url)); }
    catch (error) {
        if (error.code !== 'ENOENT') {
            console.error('No se pudo leer .env. Revisa el formato del archivo.');
            process.exit(1);
        }
    }
    const port = Number(process.env.PORT || 3000);
    server.listen(port, '127.0.0.1', () => {
        const url = `http://127.0.0.1:${server.address().port}/`;
        console.log(`MedAI disponible en ${url}`);
        console.log(getProviders('transcribe').length ? 'Transcripción: configurada (conexión real aún sin probar).' : 'Transcripción: no habilitada. Ejecuta npm run setup:groq.');
        if (process.argv.includes('--open')) openBrowser(url);
    });
}
