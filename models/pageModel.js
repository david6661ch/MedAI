// Modelo: catálogo de páginas y grupos de navegación. No contiene datos de pacientes.
const pages = [
    { path: '/', view: 'chat', label: 'Chat', icon: 'chat', group: 'primary' },
    { path: '/sintomas', view: 'sintomas', label: 'Síntomas', icon: 'stethoscope', group: 'primary' },
    { path: '/bienestar', view: 'bienestar', label: 'Salud y bienestar', icon: 'heart', group: 'primary' },
    { path: '/medicamentos', view: 'medicamentos', label: 'Medicamentos', icon: 'pill', group: 'primary' },
    { path: '/prevencion', view: 'prevencion', label: 'Prevención', icon: 'shield', group: 'primary' },
    { path: '/habitos', view: 'habitos', label: 'Hábitos saludables', icon: 'apple', group: 'primary' },
    { path: '/historial', view: 'historial', label: 'Historial', icon: 'clock', group: 'secondary' },
    { path: '/favoritos', view: 'favoritos', label: 'Favoritos', icon: 'bookmark', group: 'secondary' },
    { path: '/configuracion', view: 'configuracion', label: 'Configuración', icon: 'settings', group: 'utility' },
    { path: '/ayuda', view: 'ayuda', label: 'Ayuda', icon: 'help', group: 'utility' },
    { path: '/soporte', view: 'soporte', label: 'Soporte técnico', icon: 'headset', group: 'utility' },
    { path: '/educacion', view: 'educacion', label: 'Educación en salud', icon: 'book', parent: '/bienestar' },
    { path: '/orientacion', view: 'orientacion', label: 'Orientación general', icon: 'clipboard' }
];

export function findPage(path) {
    return pages.find(page => page.path === path);
}

export function getNavigation(group) {
    return pages.filter(page => page.group === group);
}

export const notFoundPage = { view: '404', label: 'Página no encontrada' };

// Catálogo completo para exportar las vistas estáticas.
export function getPages() {
    return pages.map(page => ({ ...page }));
}
