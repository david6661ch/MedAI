// Vista: motor mínimo para reutilizar plantillas HTML locales.
import { readFileSync } from 'node:fs';

function readTemplate(name) {
    return readFileSync(new URL(`./${name}.html`, import.meta.url), 'utf8');
}

function fill(template, values) {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? '');
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
}

export function renderPage(page, navigation) {
    const groups = {};
    for (const [group, items] of Object.entries(navigation)) {
        groups[group] = items.map(item => {
            const current = page.path === item.path;
            const active = current || page.parent === item.path;
            return fill(readTemplate('partials/nav-item'), {
                path: escapeHtml(item.path),
                label: escapeHtml(item.label),
                icon: escapeHtml(item.icon),
                active: active ? ' active' : '',
                current: current ? 'aria-current="page"' : ''
            });
        }).join('');
    }
    return fill(readTemplate('layout'), {
        title: escapeHtml(page.label),
        mainClass: page.view === 'chat' ? '' : 'inner-panel',
        icons: readTemplate('partials/icons'),
        sidebar: fill(readTemplate('partials/sidebar'), groups),
        content: fill(readTemplate(page.view), { notice: readTemplate('partials/notice') })
    });
}
