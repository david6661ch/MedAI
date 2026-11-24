# MedAI — aplicación interactiva (MVC)

Asistente de orientación general de salud en español. Node.js 20.6+ para cargar .env (recomendado Node.js 22+). No es un servicio clínico ni un sistema de diagnóstico.

## Ejecutar
```bash
npm start
```
Abre http://127.0.0.1:3000. Sin credenciales funcionan las herramientas locales; las respuestas de salud, corrección avanzada, transcripción de archivos y entrega de soporte necesitan proveedores reales.

## Funciones y privacidad
- Chat: escribir, adjuntar .txt o audio (máximo 10 MB), dictar en navegador compatible, grabar para transcripción API, comparar texto original y revisado, confirmar antes de enviar. El dictado del navegador puede utilizar servicios de terceros.
- La corrección local solo normaliza espacios; una API de revisión puede corregir ortografía/redacción. Verifica dosis, nombres, negaciones y números: ninguna transcripción es infalible. La revisión no envía la consulta de chat hasta confirmación explícita.
- Síntomas, medicamentos y orientación preparan borradores revisables; educación, prevención, hábitos y bienestar enlazan fuentes públicas y consultas temáticas. No hay diagnósticos ni tratamientos simulados.
- Favoritos y objetivos se guardan en el navegador. Historial de consultas desactivado por defecto; solo se guarda localmente si se autoriza. Configuración permite borrarlo todo. No hay cuentas ni sincronización entre dispositivos.
- Soporte valida campos, permite descargar una solicitud y solo confirma envío si un proveedor devuelve accepted:true. No enviar datos médicos a soporte.
- Ante emergencias, busca atención urgente.

## APIs
Copia .env.example a .env, completa los proveedores reales y ejecuta npm run start:api. En Windows PowerShell: Copy-Item .env.example .env. El servidor no expone claves al navegador.
- MEDAI_PROVIDER_CONFIG: JSON con operaciones chat, revise, transcribe y support. Cada operación contiene una lista de proveedores con url, tokenEnv opcional y, si kind es openai, model. El adaptador openai usa Chat Completions y Audio Transcriptions compatibles. El adaptador genérico requiere el contrato indicado abajo. No se incluye ningún proveedor ni credencial por defecto.
- Los proveedores alternativos se prueban solo si se configuraron explícitamente (máximo dos), y pueden recibir los datos del usuario. Soporte no reintenta automáticamente para evitar duplicados.
- POST /api/chat: {message} -> {text}; POST /api/revise: {text} -> {text}; POST /api/transcribe: bytes de audio, MIME de audio -> {text}; POST /api/support: {email,reason,message} -> {accepted:true}; GET /api/status: capacidades configuradas. Los proveedores genéricos de chat/revisión también reciben instructions.
- El backend está pensado para desarrollo local, con límite de tamaño, tiempo y frecuencia. Antes de exponerlo públicamente, implementa autenticación, autorización, cuotas, protección antiabuso, consentimiento informado y revisión clínica/de privacidad. CORS no sustituye autenticación. No uses datos reales en las pruebas.
- Pages no ejecuta Node.js: para habilitar sus APIs aloja el backend por separado detrás de HTTPS y autenticación, añade el origen autorizado y configura su URL pública en public/js/api-config.js. No pongas claves en ese archivo. La autenticación de usuarios y el despliegue seguro del backend quedan pendientes.

## GitHub Pages
`npm run build:pages` exporta las 13 vistas y 404 a docs/, junto con CSS y JS. En Settings → Pages selecciona Deploy from a branch, main, /docs. La URL prevista es https://david6661ch.github.io/MedAI/. Cada push con los archivos generados puede activar la publicación; no es instantánea. Cuando cambies las vistas o recursos, ejecuta npm run build:pages antes del commit. Para estilos Tailwind nuevos, instala dependencias y ejecuta npm run build:css primero.

## Arquitectura
models/ (datos y mensajes), views/ (HTML), controllers/ (páginas y gateway API), routes/ (rutas HTTP), public/ (CSS, JS, imágenes), scripts/ (exportación), docs/ (sitio estático). El frontend no requiere frameworks JavaScript adicionales. Ejecuta npm test para pruebas de rutas y gateway. No se han realizado auditorías completas de seguridad, exactitud médica o privacidad.
