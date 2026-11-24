# MedAI

Maqueta estática de un asistente de orientación general en salud, en español. El diseño toma como referencia la imagen de MedAI: tema oscuro, acentos azules, navegación lateral y seis accesos rápidos.

## Ejecutar

1. Descomprime el archivo y abre la carpeta `MedAI` en VS Code.
2. Abre `index.html` directamente en el navegador o con Live Server. No necesitas instalar dependencias para ver la maqueta: Bootstrap y Tailwind compilado se incluyen localmente.
3. Para modificar las utilidades de Tailwind, ejecuta `npm install` y luego `npm run watch:css` (requiere acceso al registro npm). `npm run build:css` compila una sola vez.

## Estructura

- `index.html`: HTML semántico de la página.
- `css/styles.css`: estilos propios, variables, estados visuales y media queries.
- `css/input.css`: configuración de utilidades Tailwind, con prefijo `tw:` y sin Preflight para evitar conflictos con Bootstrap.
- `css/output.css`: utilidades Tailwind v4.1.10 ya compiladas.
- `css/vendor/bootstrap.min.css`: Bootstrap v5.3.6 (MIT), utilizado principalmente para la cuadrícula y utilidades de accesibilidad.
- `img/`: logotipo SVG. Los iconos reutilizables se definen al principio del HTML.

## Historias de usuario

| ID | Implementación |
| --- | --- |
| HU-01 | Identidad, logotipo y paleta de colores. |
| HU-02 | Navegación lateral estática, elemento activo y estados hover. |
| HU-03 | Bienvenida y descripción. |
| HU-04 | Seis tarjetas con iconos y cuadrícula de Bootstrap. |
| HU-05 | Área de texto editable y estados focus. |
| HU-06 | Botones de adjuntar, micrófono y envío, sin acciones. |
| HU-07 | Diseño adaptable: navegación compacta y tarjetas reorganizadas. |
| HU-08 | HTML semántico, etiquetas accesibles, foco visible y enlace de salto. |
| HU-09 | Aviso de limitaciones de la orientación médica. |

## Alcance y decisiones

No incluye JavaScript, integración con IA, envío de consultas, navegación entre páginas, procesamiento de información médica, ni almacenamiento de datos. Los botones de funciones futuras se marcan con `aria-disabled="true"` y no ejecutan acciones. El campo de consulta permite escribir como parte de la maqueta. En móviles el menú se convierte en una barra de iconos estática, sin hamburguesa ni scripts. Se omiten los controles de ventana del diseño original porque corresponden al sistema operativo, no a una página web. Se añade un aviso médico no presente en la referencia. Los iconos son SVG locales. No se incluye `package-lock.json` porque no se ejecutó `npm install` en el entorno sin acceso al registro.
