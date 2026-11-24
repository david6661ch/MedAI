# MedAI — aplicación interactiva (MVC)

Asistente de orientación general de salud en español. Node.js 20.6+ para cargar .env (recomendado Node.js 22+). No es un servicio clínico ni un sistema de diagnóstico.

## Ejecutar
```bash
npm start
```
Abre http://127.0.0.1:3000. Sin credenciales funcionan las herramientas locales y la orientación basada en reglas y fuentes. Corrección avanzada, transcripción de archivos y soporte necesitan proveedores reales, aprobados y consentimiento. La generación clínica mediante modelos se mantiene bloqueada durante esta fase.

## Funciones y privacidad
- Chat: escribir, adjuntar .txt o audio (máximo 10 MB), dictar únicamente con reconocimiento local compatible, grabar para transcripción API, comparar texto original y revisado, confirmar antes de enviar. El dictado del navegador puede utilizar servicios de terceros.
- La corrección local solo normaliza espacios; una API de revisión puede corregir ortografía/redacción. Verifica dosis, nombres, negaciones y números: ninguna transcripción es infalible. La revisión no envía la consulta de chat hasta confirmación explícita.
- Síntomas, medicamentos y orientación preparan borradores revisables; educación, prevención, hábitos y bienestar enlazan fuentes públicas y consultas temáticas. No hay diagnósticos ni tratamientos simulados.
- Favoritos y objetivos se guardan en el navegador. Historial de consultas desactivado por defecto; solo se guarda localmente si se autoriza. Configuración permite borrarlo todo. No hay cuentas ni sincronización entre dispositivos.
- Soporte valida campos, permite descargar una solicitud y solo confirma envío si un proveedor devuelve accepted:true. No enviar datos médicos a soporte.
- Ante emergencias, busca atención urgente.

## APIs
Copia .env.example a .env, completa los proveedores reales y ejecuta npm run start:api. En Windows PowerShell: Copy-Item .env.example .env. El servidor no expone claves al navegador.
- MEDAI_PROVIDER_CONFIG: JSON con operaciones chat, revise, transcribe y support. Cada operación contiene una lista de proveedores con url, noTraining:true, tokenEnv opcional y, si kind es openai, model. El adaptador de chat queda reservado y no se llama en esta fase. El adaptador openai usa Chat Completions y Audio Transcriptions compatibles. El adaptador genérico requiere el contrato indicado abajo. No se incluye ningún proveedor ni credencial por defecto.
- Los proveedores alternativos se prueban solo si se configuraron explícitamente (máximo dos), y pueden recibir los datos del usuario. Soporte no reintenta automáticamente para evitar duplicados.
- POST /api/chat: {message} -> {text, rule, sources, sourceNotice, disclosure, generatedBy, policyVersion} (reglas locales); POST /api/revise: {text} -> {text}; POST /api/transcribe: bytes de audio, MIME de audio -> {text}; POST /api/support: {email,reason,message} -> {accepted:true}; GET /api/status: capacidades configuradas. Las solicitudes POST exigen X-MedAI-Consent con JSON {version,operation,accepted:true}. Los proveedores genéricos de chat/revisión también reciben instructions.
- El backend está pensado para desarrollo local, con límite de tamaño, tiempo y frecuencia. Antes de exponerlo públicamente, implementa autenticación, autorización, cuotas, protección antiabuso, consentimiento informado y revisión clínica/de privacidad. CORS no sustituye autenticación. No uses datos reales en las pruebas.
- Pages no ejecuta Node.js: para habilitar sus APIs aloja el backend por separado detrás de HTTPS y autenticación, añade el origen autorizado y configura su URL pública en public/js/api-config.js. No pongas claves en ese archivo. La autenticación de usuarios y el despliegue seguro del backend quedan pendientes.

## GitHub Pages
`npm run build:pages` exporta las 13 vistas y 404 a docs/, junto con CSS y JS. En Settings → Pages → Build and deployment → Source, selecciona GitHub Actions para usar el flujo .github/workflows/pages.yml. Cada push a main exporta las vistas, ejecuta las pruebas y publica el artefacto si estas pasan. También puedes ejecutar el flujo manualmente desde Actions. Si conservas Deploy from a branch (main, /docs), ejecuta npm run build:pages antes de cada commit para publicar los archivos estáticos actualizados. No es instantáneo. URL prevista: https://david6661ch.github.io/MedAI/. Para estilos Tailwind nuevos, instala dependencias y ejecuta npm run build:css primero.

## Arquitectura
models/ (datos y mensajes), views/ (HTML), controllers/ (páginas y gateway API), routes/ (rutas HTTP), public/ (CSS, JS, imágenes), scripts/ (exportación), docs/ (sitio estático). El frontend no requiere frameworks JavaScript adicionales. Ejecuta npm test para pruebas de rutas y gateway. No se han realizado auditorías completas de seguridad, exactitud médica o privacidad.

## Trayecto 3 — reglas éticas y criterios de salida

Las reglas están en `public/js/ethics.js` (módulo compartido con el servidor) y se prueban en `tests/ethics.test.js`. La redacción sustituye primero correos, después celulares colombianos y finalmente secuencias de 6–10 dígitos. Es heurística, no anonimización completa: puede ocultar números clínicos largos y no detecta todos los nombres, direcciones, documentos internacionales o identificadores. La revisión es obligatoria para el usuario. No se debe reintroducir información privada para restaurar una cifra; si afecta el sentido, consulta a un profesional.

El chat actual utiliza extractos locales revisados de MedlinePlus; no consulta ni confía en un modelo externo para tomar decisiones. Detecta palabras de alto impacto y urgencias de forma conservadora, no como diagnóstico ni triaje clínico. Las respuestas incluyen aviso, regla, cantidad, nombres y enlaces de las fuentes realmente utilizadas; sin evidencia se abstiene. No inventa bibliografía. El adaptador generativo se conserva para una futura integración aprobada, no se ejecuta para chat en este trayecto.

Los servicios externos están bloqueados por defecto. Para habilitarlos, el responsable debe documentar condiciones de tratamiento, retención, seguridad, transferencias y prohibición de entrenamiento/evaluación, activar MEDAI_PROVIDER_POLICY_REVIEWED y declarar noTraining:true por proveedor. Para transcripción externa se necesita además rawAudioApproved:true y consentimiento específico. Una bandera de configuración no demuestra cumplimiento legal. No se implementa entrenamiento ni evaluación con datos reales. El correo de soporte solo se destina al canal de soporte con consentimiento, no al modelo. El servidor exige un consentimiento versionado por operación y vuelve a depurar el texto. La cabecera no es autenticación ni prueba jurídica suficiente; faltan registros de consentimiento seguros y políticas del responsable antes de producción.

Pruebas de equidad: pares sintéticos cambian exclusivamente género, edad o ciudad y comparan respuestas y reglas. Cubren igualdad de enrutamiento en casos equivalentes, no ausencia de sesgos en futuros modelos. La edad u otros datos clínicamente pertinentes pueden ser relevantes para profesionales; no se debe forzar igualdad clínica injustificada. Antes de habilitar generación, ejecutar una evaluación del proveedor con casos sintéticos, revisión humana ciega, criterios de pertinencia, seguridad y fuentes; documentar diferencias y bloquear despliegue si aparecen inequidades injustificadas. No usar conversaciones reales para esta evaluación.

Referencias de diseño: [Ley 1581 de 2012](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981), [Guía ética MinTIC para entidades públicas](https://www.mintic.gov.co/portal/715/w3-article-425888.html), [OptIA — principios](https://www.optia.org/principios.html). La guía y los principios se usan como referencias de diseño, no como certificación de cumplimiento. El alcance de la propuesta de OptIA no se ha auditado en su totalidad.

## Probar audio con Groq
Con el proveedor Whisper aprobado en `.env`, ejecuta `npm run start:api`, abre `http://127.0.0.1:3000/` y comprueba `/api/status` (transcribe:true). El botón de micrófono y Grabar audio usan MediaRecorder y `/api/transcribe`. Dictado local es una opción separada. Pulsa una vez para grabar, habla unos segundos y pulsa otra vez; autoriza el envío del audio ficticio y revisa la transcripción. GitHub Pages necesita un backend HTTPS externo para la API. Un error del proveedor se comunica mediante códigos controlados, sin exponer credenciales ni cuerpos de error. No sobrescribas tu .env existente.
