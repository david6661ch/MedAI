import { createServer } from 'node:http';
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const port = Number(process.env.PORT || 3000);
    server.listen(port, '127.0.0.1', () => {
        console.log(`MedAI disponible en http://127.0.0.1:${port}`);
    });
}
