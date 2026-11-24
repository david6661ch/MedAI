# MedAI — versión 2.0 (MVC)

Maqueta web en español de un asistente de orientación general en salud. Conserva el diseño oscuro de la versión inicial. La navegación entre vistas funciona, pero no existe IA, diagnóstico, almacenamiento, autenticación ni procesamiento de consultas.

## Inicio rápido

Requisito: Node.js 20 o superior. Abre la carpeta MedAI-MVC en VS Code, abre la terminal y ejecuta:

```bash
npm start
```

El servidor abrirá automáticamente la pantalla inicial de MedAI en tu navegador predeterminado al estar listo. Si el sistema no permite abrirlo, entra manualmente en http://127.0.0.1:3000. Para iniciar sin abrir el navegador, utiliza `npm run start:server`. No se requiere `npm install` para iniciar porque el servidor usa módulos nativos y las hojas de estilos ya están incluidas. No utilices Live Server ni abras las plantillas directamente: el servidor MVC debe componerlas.

Para reiniciar automáticamente al cambiar archivos JavaScript:

```bash
npm run dev
```

Para modificar utilidades de Tailwind (opcional; requiere acceso a npm):

```bash
npm install
npm run watch:css
```

El servidor escucha solo en la máquina local. Si el puerto 3000 está ocupado, en PowerShell puedes ejecutar `$env:PORT=3001; npm start`.

## Arquitectura MVC

```text
MedAI-MVC/
├── models/pageModel.js         # Catálogo de páginas y navegación
├── views/                     # Plantillas HTML y motor de renderizado
│   ├── layout.html             # Estructura común
│   ├── partials/               # Menú, iconos, aviso, elemento de navegación
│   ├── render.js               # Combina plantillas y datos
│   └── ...                     # Una plantilla por página y una 404
├── controllers/pageController.js # Coordina modelo y vista
├── routes/pageRoutes.js        # Enrutamiento y recursos estáticos
├── public/
│   ├── css/                    # CSS propio, Bootstrap y Tailwind
│   └── img/logo.svg
├── tests/routes.test.js        # Pruebas HTTP
├── server.js                   # Servidor HTTP de Node.js
└── package.json
```

Flujo: navegador → server.js → pageRoutes.js → pageController.js → pageModel.js → render.js → HTML → navegador.

El modelo contiene metadatos de navegación, no una base de datos. El controlador selecciona la página y el estado HTTP. La vista reutiliza el mismo menú y layout. Se eligió JavaScript con Node.js nativo para evitar una dependencia de servidor adicional; no se usa Express ni JavaScript del lado del cliente.

## Rutas

| Ruta | Vista |
| --- | --- |
| `/` | Chat / bienvenida |
| `/sintomas` | Síntomas |
| `/bienestar` | Salud y bienestar |
| `/medicamentos` | Medicamentos |
| `/prevencion` | Prevención y vacunas |
| `/habitos` | Hábitos saludables |
| `/historial` | Historial vacío |
| `/favoritos` | Favoritos vacíos |
| `/configuracion` | Configuración ilustrativa |
| `/ayuda` | Ayuda y preguntas frecuentes |
| `/soporte` | Soporte técnico (formulario ilustrativo) |
| `/educacion` | Educación en salud |
| `/orientacion` | Orientación general |

Las dos últimas se abren mediante tarjetas de inicio y enlaces contextuales. Las direcciones no reconocidas devuelven una página 404.

## Cómo ampliar el proyecto

1. Crea una plantilla HTML en `views/` siguiendo una vista existente.
2. Registra su ruta, nombre e icono en `models/pageModel.js`. Si debe salir en el menú, asigna un grupo (`primary`, `secondary` o `utility`).
3. El controlador general y el layout la cargarán sin duplicar código.
4. Añade estilos específicos en `public/css/styles.css`. Bootstrap controla la cuadrícula y Tailwind usa prefijo `tw:` y no activa Preflight, como en la primera versión.

## Alcance y pruebas

- Los botones y campos de las funciones médicas son ilustrativos. El cuadro de chat permite escribir localmente, pero no envía información. No introduzcas datos sensibles.
- El aviso de IA se reutiliza en todas las vistas. El soporte técnico está disponible desde el menú y Ayuda; su formulario no envía datos y no existe aún un canal de contacto real.
- Las preguntas frecuentes se expanden mediante HTML nativo (`details`). Los enlaces internos funcionan.
- `npm test` comprueba las rutas, recursos, página 404, archivos no públicos y métodos HTTP.
- No es un servicio médico, ni está preparado para un despliegue en producción. No se han realizado auditorías de seguridad o accesibilidad completas.

## GitHub Pages

La carpeta `docs/` contiene una exportación estática completa de las vistas MVC: no requiere Node.js en el navegador ni servidor en GitHub Pages. URL prevista: https://david6661ch.github.io/MedAI/.

En Settings → Pages, selecciona **Deploy from a branch**, rama **main**, carpeta **/docs**, y guarda. La URL se habilita cuando GitHub termina el despliegue.

Cuando modifiques las vistas, ejecuta `npm run build:pages` y sube los cambios de `docs/` junto con los archivos fuente. Si cambias las utilidades Tailwind, recompila antes con `npm run build:css`. La versión local MVC sigue funcionando con `npm start`.
