import { loadEnvFile } from 'node:process';
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { getProviders } from '../services/providerConfig.js';

const envPath = new URL('../.env', import.meta.url);
async function main() {
    let contents;
    try {
        contents = await readFile(envPath, 'utf8');
        loadEnvFile(envPath);
    } catch {
        console.log('No se pudo leer .env. Crea el archivo y añade GROQ_API_KEY con tu clave nueva.');
        process.exitCode = 1;
        return;
    }
    const key = process.env.GROQ_API_KEY?.trim();
    if (!key) {
        console.log('Falta GROQ_API_KEY en .env. No compartas la clave.');
        process.exitCode = 1;
        return;
    }
    let response;
    try {
        response = await fetch('https://api.groq.com/openai/v1/models', {
            headers: { Authorization: 'Bearer ' + key },
            signal: AbortSignal.timeout(15000),
            redirect: 'error'
        });
        if (!response.ok) {
            console.log('Groq devolvió HTTP ' + response.status + '. Revisa la clave, los permisos o la cuota.');
            await response.body?.cancel();
            process.exitCode = 1;
            return;
        }
        const models = await response.json();
        if (!models.data?.some(model => model.id === 'whisper-large-v3')) {
            console.log('Whisper Large V3 no aparece entre los modelos disponibles de esta cuenta.');
            process.exitCode = 1;
            return;
        }
    } catch {
        console.log('No se pudo comprobar Groq. Revisa la conexión a Internet.');
        process.exitCode = 1;
        return;
    }
    console.log('Groq conectado. Whisper Large V3 disponible. No se envió audio.');
    let config;
    try { config = JSON.parse(process.env.MEDAI_PROVIDER_CONFIG || '{}'); }
    catch { console.log('MEDAI_PROVIDER_CONFIG contiene JSON inválido. Corrige esa línea en .env.'); process.exitCode=1; return; }
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
        console.log('MEDAI_PROVIDER_CONFIG debe ser un objeto JSON.'); process.exitCode=1; return;
    }
    // La aprobación de Groq no debe habilitar otros proveedores por accidente.
    const isGroqWhisper = p => p?.model==='whisper-large-v3' &&
        p.tokenEnv==='GROQ_API_KEY' && p.url==='https://api.groq.com/openai/v1/audio/transcriptions';
    if (process.env.MEDAI_PROVIDER_POLICY_REVIEWED !== 'true' &&
        Object.entries(config).some(([operation, list]) => Array.isArray(list) &&
            list.some(p => operation !== 'transcribe' || !isGroqWhisper(p)))) {
        console.log('Hay otros proveedores explícitos. Revisa y autoriza su política por separado; no se modificó .env.');
        process.exitCode=1;
        return;
    }
    const approvedEnv = {...process.env, MEDAI_PROVIDER_POLICY_REVIEWED:'true', MEDAI_GROQ_AUDIO_APPROVED:'true'};
    const configured = getProviders('transcribe', approvedEnv);
    if (!configured.some(p=>p.model==='whisper-large-v3' && p.tokenEnv==='GROQ_API_KEY' && p.url==='https://api.groq.com/openai/v1/audio/transcriptions')) {
        console.log('Existe una configuración explícita de transcripción distinta o deshabilitada. No se sobrescribirá. Revisa MEDAI_PROVIDER_CONFIG.');
        process.exitCode=1; return;
    }
    if (getProviders('transcribe').some(p=>p.model==='whisper-large-v3' && p.tokenEnv==='GROQ_API_KEY' && p.url==='https://api.groq.com/openai/v1/audio/transcriptions')) {
        console.log('Whisper ya está configurado. Ejecuta npm start.');
        return;
    }
    console.log('Antes de habilitar audio, revisa https://console.groq.com/ y las condiciones de retención, no entrenamiento y tratamiento de audio.');
    console.log('El audio original puede contener datos personales. Usa solo datos ficticios en esta fase.');
    const rl=createInterface({input:process.stdin,output:process.stdout});
    let answer;
    try { answer=await rl.question('¿Has revisado y aprobado esas condiciones para Groq? Escribe SI para confirmar: '); }
    finally { rl.close(); }
    if (answer.trim().toUpperCase()!=='SI') {
        console.log('No se cambió .env. El audio externo permanece deshabilitado.');
        return;
    }
    // Releer para no sobrescribir cambios concurrentes ni revelar el contenido.
    if (await readFile(envPath,'utf8') !== contents) {
        console.log('.env cambió durante la configuración. Ejecuta el comando de nuevo.');
        process.exitCode=1;return;
    }
    // Sustituir solo asignaciones simples, preservando la clave y demás opciones.
    for (const name of ['MEDAI_PROVIDER_POLICY_REVIEWED','MEDAI_GROQ_AUDIO_APPROVED']) {
        contents=contents.replace(new RegExp('^\\s*(?:export\\s+)?'+name+'\\s*=.*$', 'gm'),'');
        contents=contents.trimEnd()+'\n'+name+'=true\n';
    }
    await writeFile(envPath,contents,{encoding:'utf8',mode:0o600});
    console.log('Configuración local guardada. Ejecuta npm start y prueba audio ficticio.');
}
main().catch(()=>{console.error('No se pudo completar la configuración local.');process.exitCode=1;});
