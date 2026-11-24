// Controlador: solicita información al modelo y entrega la vista correspondiente.
import { findPage, getNavigation, notFoundPage } from '../models/pageModel.js';
import { renderPage } from '../views/render.js';

export function showPage(path, response, headOnly = false) {
    const page = findPage(path);
    const navigation = {
        primary: getNavigation('primary'),
        secondary: getNavigation('secondary'),
        utility: getNavigation('utility')
    };
    const html = renderPage(page ?? notFoundPage, navigation);
    response.writeHead(page ? 200 : 404, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(headOnly ? undefined : html);
}
