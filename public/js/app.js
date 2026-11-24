import { API_BASE } from './api-config.js';
import { prepareAudio } from './audio.js';
import { redactPersonalData, localGuidance, safeRevision, POLICY_VERSION, sourceNotice, DISCLOSURE } from './ethics.js';

const $ = id => document.getElementById(id);
const node = (tag, text, cls) => {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (cls) el.className = cls;
    return el;
};
const button = (text, fn, cls = 'action-button') => {
    const el = node('button', text, cls);
    el.type = 'button';
    el.addEventListener('click', fn);
    return el;
};
const read = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem('medai:' + key)) ?? fallback; }
    catch { return fallback; }
};
const save = (key, value) => {
    try { localStorage.setItem('medai:' + key, JSON.stringify(value)); return true; }
    catch { return false; }
};
const prefs = () => ({ theme: 'Oscuro', history: false, ...read('prefs', {}) });
const list = key => { const value = read(key, []); return Array.isArray(value) ? value : []; };
// Depurar identificadores detectables de registros antiguos sin transmitirlos.
for(const key of ['history','goals']){
    const items=list(key);
    const cleaned=items.filter(x=>x&&typeof x==='object').map(x=>key==='history'?{...x,question:redactPersonalData(x.question),answer:redactPersonalData(x.answer)}:{...x,text:redactPersonalData(x.text)});
    if(JSON.stringify(cleaned)!==JSON.stringify(items))save(key,cleaned);
}
const id = () => globalThis.crypto?.randomUUID?.() ?? Date.now() + '-' + Math.random();
const home = document.querySelector('.nav-item[title="Chat"]')?.href ?? './';
const notice = 'No tengo esa información. No dispongo de datos suficientes o fiables para responder con seguridad. Consulta a un profesional de la salud.';
const status = node('p', '', 'app-status');
status.setAttribute('role', 'status');
status.setAttribute('aria-live', 'polite');
const show = (text) => { status.textContent = text; };
const main = $('contenido');
if (main) main.prepend(status);
function applyTheme() {
    const light = prefs().theme === 'Claro';
    document.documentElement.dataset.medaiTheme = light ? 'light' : 'dark';
    document.documentElement.dataset.bsTheme = light ? 'light' : 'dark';
}
applyTheme();
function apiBase() {
    if (API_BASE) {
        const url = new URL(API_BASE);
        if (url.protocol !== 'https:') throw Error('El servidor remoto debe usar HTTPS.');
        return url.href.replace(/\/$/, '');
    }
    if (['localhost','127.0.0.1','[::1]'].includes(location.hostname) && !location.pathname.endsWith('.html')) return location.origin;
    return '';
}
async function api(operation, payload, type = 'application/json') {
    const base = apiBase();
    if (!base) throw Error('No hay un servidor API configurado.');
    const response = await fetch(base + '/api/' + operation, {
        method: 'POST', headers: { 'Content-Type': type, 'X-MedAI-Consent': JSON.stringify({version:POLICY_VERSION,operation,accepted:true}) },
        body: type === 'application/json' ? JSON.stringify(payload) : payload,
        signal: AbortSignal.timeout(90000), cache: 'no-store'
    });
    if (!response.ok) {
        const detail = await response.json().catch(()=>({}));
        const messages = { PROVIDER_KEY:'La clave del proveedor no está configurada o fue rechazada.', PROVIDER_QUOTA:'El proveedor alcanzó su límite de uso. Intenta más tarde.', PROVIDER_AUDIO:'El proveedor rechazó el formato o contenido del audio.', PROVIDER_SILENCE:'Whisper detectó probable silencio. Escucha el audio y prueba otro micrófono.', PROVIDER_EMPTY:'El proveedor no devolvió texto. Habla claramente y prueba una grabación más larga.', PROVIDER_TIMEOUT:'El proveedor tardó demasiado en responder.', PROVIDER_UNAVAILABLE:'No se pudo contactar con el proveedor.', PROVIDER_FORBIDDEN:'El proveedor denegó el acceso al modelo.' };
        if(messages[detail.code]) throw Error(messages[detail.code]);
        if (response.status === 503) throw Error('Servicio no configurado o sin aprobación de privacidad. Revisa /api/status y .env.');
        throw Error('No se pudo completar la solicitud (' + response.status + ').');
    }
    return response.json();
}
function localRevision(value) {
    // No modifica palabras, números, dosis, negaciones ni nombres de medicamentos.
    return value.replace(/\r\n?/g, '\n').split('\n')
        .map(line => line.trim().replace(/[ \t]+/g, ' ')).join('\n').trim();
}
function queue(text) {
    if (!text.trim()) { show('Escribe una consulta primero.'); return; }
    try {
        sessionStorage.setItem('medai:draft', redactPersonalData(text));
        location.href = home;
    } catch { show('No se pudo transferir el borrador. Copia el texto y abre Chat.'); }
}
function copy(text) {
    return navigator.clipboard?.writeText(text).then(() => show('Texto copiado.'), () => show('No se pudo copiar. Selecciona el texto manualmente.')) ?? Promise.resolve(show('Portapapeles no disponible.'));
}
function download(text, filename) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = node('a'); a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function addFavorite(item) {
    // Solo se guardan temas públicos, no síntomas ni conversaciones.
    const favorites = list('favorites');
    if (!favorites.some(x => x.title === item.title && x.page === item.page)) {
        if (!save('favorites', [...favorites, item])) return show('No se pudo guardar el favorito.');
    }
    show('Tema guardado en Favoritos.');
}
function reviseUI() {
    const input = $('consulta');
    if (!input) return;
    const composer = input.closest('.composer-area');
    const send = composer.querySelector('.send-button');
    const mic = composer.querySelector('[aria-label*="micrófono"]');
    const attach = composer.querySelector('.attach-button');
    const tools = node('div', undefined, 'chat-tools');
    const info = node('p', 'Orientación local por reglas. Ocultamos correos, celulares y documentos; elimina nombres y otros datos identificables. No usamos consultas para entrenar ni evaluar. Audio y corrección externa requieren autorización específica.', 'muted-copy');
    const review = node('section', undefined, 'content-panel transcript-review');
    review.hidden = true;
    review.append(node('h2','Revisar texto antes de enviar'));
    const originalLabel = node('label','Texto original o transcripción');
    const original = node('textarea',undefined,'form-control'); original.id='transcript-original'; original.readOnly=true; original.rows=3; originalLabel.htmlFor=original.id;
    const editedLabel = node('label','Texto revisado (editable)');
    const edited = node('textarea',undefined,'form-control'); edited.id='transcript-edited'; edited.rows=4; editedLabel.htmlFor=edited.id;
    review.append(originalLabel, original, editedLabel, edited);
    let revisionVersion = 0, busy = false, recorder, stream, recognition, recording = false, starting = false, leaving = false;
    const transcript = (text) => {
        revisionVersion++;
        original.value = text;
        edited.value = redactPersonalData(localRevision(text));
        review.hidden = false;
        edited.focus();
        show('Se ocultaron identificadores detectables. Revisa también nombres, direcciones y otros datos. No se ha enviado ninguna consulta al chat.');
    };
    const revised = button('Mejorar redacción con API', async () => {
        if (busy || recording || recognition) return show('Termina la operación en curso.');
        if (!edited.value.trim()) return show('No hay texto para revisar.');
        const before = redactPersonalData(edited.value);
        edited.value = before;
        if (!confirm('¿Autorizar el envío de este texto revisado al proveedor de corrección? Los patrones detectables de correo, celular y documento se ocultan; elimina otros datos identificables antes de aceptar. No se autoriza entrenamiento ni evaluación.')) return;
        const version = ++revisionVersion;
        revised.disabled = true;
        try {
            const r = await api('revise',{text: before});
            if (version === revisionVersion && edited.value === before && typeof r.text === 'string' && r.text.trim()) {
                const corrected = redactPersonalData(r.text);
                if(!safeRevision(before,corrected))throw Error('La revisión cambió números o negaciones. Se conservó el texto anterior.');
                edited.value = corrected; show('Texto generado con IA. Compara con el original y verifica que no cambie el significado.');
            }
        } catch(e) { show(e.message + ' Puedes editar el texto manualmente.'); }
        finally { revised.disabled = false; }
    });
    review.append(revised, button('Usar texto revisado', () => {
        if (!edited.value.trim()) return show('El texto está vacío.');
        revisionVersion++;
        input.value = redactPersonalData(edited.value); input.dispatchEvent(new Event('input'));
        review.hidden = true; original.value = ''; edited.value = ''; input.focus();
        show('Texto preparado. Pulsa Enviar cuando estés listo.');
    }), button('Descartar', () => { revisionVersion++; review.hidden=true; original.value=''; edited.value=''; show('Revisión descartada.'); }));
    const chatLog = node('section',undefined,'chat-log');
    chatLog.setAttribute('aria-label','Conversación'); chatLog.setAttribute('aria-live','polite');
    const content = main.querySelector('.main-content');
    content?.append(chatLog);
    const audioPreview=node('section',undefined,'content-panel');audioPreview.hidden=true;
    const player=node('audio');player.controls=true;player.preload='metadata';player.style.width='100%';
    const audioDetail=node('p','','muted-copy');
    let pendingAudio=null,previewUrl='',previewVersion=0;
    function clearAudio(){previewVersion++;player.pause();player.removeAttribute('src');player.load();if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl='';pendingAudio=null;audioPreview.hidden=true;}
    const sendAudio=button('Transcribir audio',async()=>{if(!pendingAudio)return;await transcribe(pendingAudio);});
    audioPreview.append(node('h2','Escuchar grabación antes de transcribir'),audioDetail,player,sendAudio,button('Descartar audio',()=>{if(!busy)clearAudio();}));
    content?.append(audioPreview);
    async function previewAudio(blob){
        if(busy||recording||starting||recognition||leaving)return show('Termina primero la operación de audio.');
        if(!blob.size||blob.size>10*1024*1024)return show('El audio está vacío o supera 10 MB.');
        clearAudio();const version=previewVersion;busy=true;sendAudio.disabled=true;show('Comprobando grabación…');
        let prepared=null;
        try{prepared=await prepareAudio(blob);}catch{/* Algunos navegadores no decodifican todos los contenedores. */}
        finally{busy=false;}
        if(version!==previewVersion||leaving)return;
        const stats=prepared?.stats;
        pendingAudio=prepared?.blob.size<=10*1024*1024?prepared.blob:blob;
        previewUrl=URL.createObjectURL(pendingAudio);player.src=previewUrl;audioPreview.hidden=false;
        const weak=stats&&(stats.peak<0.005||stats.rms<0.0005);
        const short=stats&&stats.seconds<0.8;
        sendAudio.disabled=!!(weak||short);
        audioDetail.textContent=stats?stats.seconds.toFixed(1)+' s · nivel de señal '+(stats.peak*100).toFixed(1)+'% · '+(pendingAudio.type==='audio/wav'?'WAV mono':'audio original'):'No se pudo medir el audio en este navegador. Escúchalo antes de enviar.';
        show(weak?'La grabación está casi en silencio. Comprueba el micrófono y vuelve a grabar.':short?'Grabación demasiado corta. Habla unos segundos y vuelve a grabar.':'Escucha la grabación. Si contiene tu frase completa, pulsa Transcribir audio. Aún no se envió nada.');
        audioPreview.scrollIntoView({block:'nearest'});
    }
    const audioFile = node('input'); audioFile.type='file'; audioFile.accept='audio/*,.webm,.m4a,.mp3,.wav,.ogg,.txt,text/plain'; audioFile.hidden=true;
    async function transcribe(blob) {
        if (busy || recording || starting || recognition || leaving) return show('Termina primero la operación de audio.');
        if (blob.size === 0 || blob.size > 10*1024*1024) return show('El audio debe tener entre 1 byte y 10 MB.');
        busy=true; send.disabled=true; mic.disabled=true; attach.disabled=true; record.disabled=true; localDictation.disabled=true; sendAudio.disabled=true;
        try {
            if (!await checkTranscription() || leaving) return;
            if (!confirm('El audio original puede contener tu voz y datos de salud. No puede anonimizarse completamente antes de transcribirlo. Solo un proveedor autorizado para audio y sin entrenamiento/evaluación podrá procesarlo. ¿Autorizas este envío específico?')) return;
            show('Transcribiendo audio con el proveedor configurado…');
            const mime = (blob.type || 'application/octet-stream').split(';')[0];
            const r = await api('transcribe',blob,mime);
            if (typeof r.text !== 'string' || !r.text.trim()) throw Error('No se recibió una transcripción utilizable.');
            if(leaving)return;
            clearAudio();transcript(redactPersonalData(r.text));
            if(r.qualityWarning)show('Whisper indica posible baja confianza o silencio. Compara la transcripción con lo que dijiste y corrige antes de usarla.');
        } catch(e) { show(e.message + ' Puedes volver a intentar o escribir la consulta.'); }
        finally { busy=false; send.disabled=false; mic.disabled=false; attach.disabled=false; record.disabled=false; localDictation.disabled=false; sendAudio.disabled=false; }
    }
    audioFile.addEventListener('change',async () => {
        const file=audioFile.files[0]; audioFile.value='';
        if(!file) return;
        if(file.type==='text/plain'||file.name.toLowerCase().endsWith('.txt')){
            if(file.size>100000) return show('El archivo de texto supera 100 KB.');
            transcript(await file.text());
        } else await previewAudio(file);
    });
    attach.disabled=false; attach.setAttribute('aria-label','Adjuntar audio o archivo de texto');
    attach.title='Adjuntar audio o texto';
    attach.addEventListener('click',()=>audioFile.click());
    tools.append(audioFile,button('Revisar redacción',()=>{if(input.value.trim())transcript(input.value);else show('Escribe un texto primero.');},'small-action'));
    const deviceSelect=node('select',undefined,'form-select');deviceSelect.setAttribute('aria-label','Micrófono de entrada');
    const defaultDevice=node('option','Micrófono predeterminado');defaultDevice.value='';deviceSelect.append(defaultDevice);
    async function refreshDevices(){
        try{const devices=await navigator.mediaDevices.enumerateDevices();const chosen=deviceSelect.value;deviceSelect.replaceChildren(defaultDevice);for(const [i,d] of devices.filter(d=>d.kind==='audioinput'&&d.deviceId&&d.deviceId!=='default').entries()){const opt=node('option',d.label||'Micrófono '+(i+1));opt.value=d.deviceId;deviceSelect.append(opt);}if([...deviceSelect.options].some(o=>o.value===chosen))deviceSelect.value=chosen;}catch{}
    }
    tools.append(deviceSelect);refreshDevices();navigator.mediaDevices?.addEventListener?.('devicechange',refreshDevices);
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    mic.disabled=false; mic.setAttribute('aria-label','Grabar o detener audio para transcripción'); mic.title='Grabar audio para transcripción';
    const localDictation = button('Dictado local',()=>{
        if (recognition) {recognition.stop();return;}
        if (busy || recording || starting) return show('Termina primero la operación de audio.');
        if (!Speech) return show('Este navegador no admite dictado directo. Usa Grabar audio o adjunta un archivo.');
        // Sin reconocimiento local comprobable, no enviar voz a servicios del navegador.
        if (!('processLocally' in Speech.prototype)) return show('Dictado externo deshabilitado por privacidad. Usa texto o transcripción autorizada.');
        if (!confirm('¿Autorizar dictado exclusivamente local? No compartas información identificable.')) return;
        let finalText='', interim='', speechError='';
        recognition=new Speech(); recognition.processLocally=true; recognition.lang='es-CO'; recognition.continuous=true; recognition.interimResults=true;
        recognition.onresult=e=>{
            interim='';
            for(let i=e.resultIndex;i<e.results.length;i++){
                const part=e.results[i][0].transcript;
                if(e.results[i].isFinal)finalText+=part+' ';else interim+=part;
            }
            show('Dictando… '+interim);
        };
        recognition.onerror=e=>{speechError=e.error;show('Dictado local: '+speechError);};
        recognition.onend=()=>{ recognition=null; localDictation.textContent='Dictado local'; if(leaving)return; if(finalText.trim())transcript(finalText.trim());else show(speechError?'Dictado local no disponible: '+speechError+'. Usa Grabar audio con la API.':'El dictado local no reconoció palabras. Usa Grabar audio con la API.'); };
        try { recognition.start(); localDictation.textContent='Detener dictado local'; show('Escuchando localmente. Pulsa Detener dictado local para terminar.'); }
        catch(e){recognition=null;show('No se pudo iniciar el dictado local.');}
    },'small-action');
    tools.append(localDictation);
    async function checkTranscription(){
        try{
            const base=apiBase();
            if(!base){show('GitHub Pages no tiene backend de audio conectado. Abre http://127.0.0.1:3000/ con npm run start:api.');return false;}
            const response=await fetch(base+'/api/status',{cache:'no-store',signal:AbortSignal.timeout(8000)});
            if(!response.ok)throw Error('No se pudo consultar el estado del servidor.');
            const config=await response.json();
            if(!config.transcribe){show('Transcripción deshabilitada. Revisa .env, la clave y las autorizaciones de privacidad; reinicia con npm run start:api.');return false;}
            return true;
        }catch(e){show('No se pudo verificar el backend: '+e.message);return false;}
    }
    function resetRecording(){
        recording=false; starting=false;
        stream?.getTracks().forEach(t=>t.stop());
        stream=null;
        record.textContent='Grabar audio';
        mic.classList.remove('recording');mic.setAttribute('aria-pressed','false');
        send.disabled=false; mic.disabled=false; attach.disabled=false; record.disabled=false; localDictation.disabled=false;
    }
    async function toggleRecording(){
        if(recording){if(recorder?.state==='recording')recorder.stop();return;}
        if(busy||recognition||starting||leaving)return show('Termina primero la operación en curso.');
        if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)return show('La grabación requiere un navegador compatible y HTTPS o localhost.');
        starting=true;record.disabled=true;mic.disabled=true;send.disabled=true;attach.disabled=true;localDictation.disabled=true;
        try{
            if(!await checkTranscription()){resetRecording();return;}
            if(!confirm('¿Permitir grabación local? Podrás decidir después si envías el audio a transcripción.')){resetRecording();return;}
            stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,...(deviceSelect.value?{deviceId:{exact:deviceSelect.value}}:{})}});
            refreshDevices();
            if(leaving){resetRecording();return;}
            const formats=['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus'];
            const mimeType=formats.find(type=>MediaRecorder.isTypeSupported(type));
            const chunks=[];let size=0,failed=false;const startedAt=performance.now();
            const capture=new MediaRecorder(stream,mimeType?{mimeType}:undefined);
            recorder=capture;
            capture.ondataavailable=e=>{if(!e.data.size)return;size+=e.data.size;if(size<=10*1024*1024)chunks.push(e.data);if((size>10*1024*1024||performance.now()-startedAt>=300000)&&capture.state==='recording')capture.stop();};
            capture.onerror=()=>{failed=true;resetRecording();show('Error al grabar el audio.');};
            capture.onstop=async()=>{
                if(failed||leaving){resetRecording();return;}
                const blob=new Blob(chunks,{type:capture.mimeType||chunks[0]?.type||'audio/webm'});
                resetRecording();
                if(size>10*1024*1024)return show('Grabación demasiado larga (máximo 10 MB).');
                if(!blob.size)return show('No se capturó audio. Comprueba el permiso y el micrófono.');
                await previewAudio(blob);
            };
            capture.start(250);starting=false;recording=true;record.disabled=false;mic.disabled=false;
            record.textContent='Detener grabación';mic.classList.add('recording');mic.setAttribute('aria-pressed','true');
            show('Grabando audio… habla y pulsa el micrófono otra vez para terminar.');
        }catch(e){resetRecording();show(e.name==='NotAllowedError'?'Permiso de micrófono denegado. Revisa los permisos del navegador.':e.name==='NotFoundError'?'No se encontró un micrófono.':'No se pudo grabar: '+e.name);}
    }
    const record=button('Grabar audio',toggleRecording,'small-action');
    mic.setAttribute('aria-pressed','false');mic.addEventListener('click',toggleRecording);
    tools.append(record);
    const chatStatus=node('p','','app-status');chatStatus.setAttribute('role','status');
    // Mantener el estado de voz y errores junto a la barra persistente.
    composer.prepend(status);
    composer.querySelector('.composer').after(tools,info,chatStatus);
    content?.append(review);
    function bubble(role,text,metadata){
        const item=node('article',undefined,'assistant-message '+(role==='Tú'?'user-message':''));
        item.append(node('strong',role),node('p',text));
        if(metadata){
            item.append(node('p',metadata.disclosure,'muted-copy'),node('p','Regla aplicada: '+metadata.rule,'muted-copy'),node('p',sourceNotice(metadata.sources),'muted-copy'));
            for(const source of metadata.sources){const link=node('a',source.name,'text-link');link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';item.append(link,node('br'));}
        }
        chatLog.append(item);item.scrollIntoView({block:'nearest'});
    }
    send.disabled=false;send.setAttribute('aria-label','Enviar consulta');send.title='Enviar consulta';
    async function submit(){
        if(busy||recording||starting||recognition||!review.hidden||!audioPreview.hidden)return show('Termina la revisión o grabación antes de enviar.');
        const originalQuestion=input.value.trim();
        if(!originalQuestion)return show('Escribe una consulta.');
        if(originalQuestion.length>12000)return show('La consulta supera 12.000 caracteres.');
        const question=redactPersonalData(originalQuestion);
        if(question!==originalQuestion){
            input.value=question;input.dispatchEvent(new Event('input'));
            return show('Se ocultaron correos, celulares o documentos detectados. Revisa otros datos personales y pulsa Enviar nuevamente.');
        }
        // Respuestas locales, sin transferencia a un proveedor ni diagnóstico.
        const result=localGuidance(question);
        bubble('Tú',question);
        bubble('MedAI',result.text,result);
        if(prefs().history&&!save('history',[{id:id(),question,answer:result.text,date:new Date().toISOString(),rule:result.rule,sources:result.sources,disclosure:result.disclosure},...list('history')].slice(0,100)))show('No se pudo guardar el historial.');
        input.value='';input.dispatchEvent(new Event('input'));
        chatStatus.textContent='Orientación mediante reglas; no se ha enviado la consulta a un modelo.';
    }
    send.addEventListener('click',submit);
    input.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();submit();}});
    try{const draft=sessionStorage.getItem('medai:draft');if(draft){sessionStorage.removeItem('medai:draft');transcript(draft);}}catch{}
    window.addEventListener('pagehide',()=>{leaving=true;clearAudio();recognition?.abort();if(recorder?.state==='recording')recorder.stop();stream?.getTracks().forEach(t=>t.stop());});
    window.addEventListener('pageshow',()=>{leaving=false;});
}
function activate(id, handler, text) {
    const el=$(id); if(!el)return;
    const section=el.closest('.content-panel');
    section.querySelectorAll('input,textarea,select').forEach(e=>e.disabled=false);
    section.querySelector('.demo-label')?.remove();
    const desc=section.querySelector('.section-description');if(desc)desc.textContent='Completa los campos y revisa la consulta antes de enviarla.';
    const action=section.querySelector('.action-button');if(action){action.disabled=false;action.textContent=text;action.addEventListener('click',handler);}
}
const v=id=>$(id)?.value?.trim()??'';
function sections(){
    activate('sintoma',()=>{if(!v('sintoma'))return show('Describe lo que sientes.');queue('Síntomas: '+v('sintoma')+'\nDuración: '+v('duracion')+'\nIntensidad: '+v('intensidad')+'\nSolicito orientación general, no un diagnóstico.');},'Preparar consulta');
    activate('medicamento',()=>{if(!v('medicamento'))return show('Escribe el nombre del medicamento.');queue('Información general y precauciones del medicamento '+v('medicamento')+'. No indicar cambios de tratamiento ni dosis personalizadas.');},'Consultar medicamento');
    activate('pregunta',()=>{if(!v('pregunta'))return show('Escribe tu pregunta.');queue('Tema: '+v('tema-consulta')+'\n'+v('pregunta'));},'Preparar orientación');
    document.querySelectorAll('.topic-card').forEach(card=>{
        const title=card.querySelector('h3')?.textContent;if(!title)return;
        const body=card.querySelector('div');if(!body)return;
        body.append(button('Consultar',()=>queue('Quiero información general y fuentes fiables sobre '+title+'.'),'small-action'),
            button('Guardar tema',()=>addFavorite({title,page:location.pathname}),'small-action'));
    });
    if(document.querySelector('.topic-card')){
        document.querySelectorAll('.content-panel .section-description').forEach(el=>{if(/futura biblioteca|futura versión|futuras consultas|aún no está conectada|podrá incluir/.test(el.textContent))el.textContent='Explora los temas y prepara una consulta o revisa una fuente de información fiable.';});
        const link=node('a','Biblioteca de salud de MedlinePlus (fuente externa)','text-link');
        link.href='https://medlineplus.gov/spanish/';link.target='_blank';link.rel='noopener noreferrer';
        document.querySelector('.topic-card').closest('.content-panel').append(link);
    }
    if($('objetivo')){
        const section=$('objetivo').closest('.content-panel'), output=node('div',undefined,'saved-items');
        section.append(output);
        function render(){output.replaceChildren();for(const goal of list('goals')){
            const row=node('div',undefined,'saved-row');const check=node('input');check.type='checkbox';check.checked=!!goal.done;check.setAttribute('aria-label','Marcar objetivo como completado');
            check.addEventListener('change',()=>{if(save('goals',list('goals').map(x=>x.id===goal.id?{...x,done:check.checked}:x)))render();else show('No se pudo guardar.');});
            row.append(check,node('span',goal.text),button('Eliminar',()=>{if(save('goals',list('goals').filter(x=>x.id!==goal.id)))render();},'small-action'));output.append(row);
        }if(!output.children.length)output.append(node('p','No hay objetivos guardados.','muted-copy'));}
        activate('objetivo',()=>{const text=redactPersonalData(v('objetivo'));if(!text)return show('Escribe un objetivo.');if(text.length>200)return show('Máximo 200 caracteres.');if(save('goals',[...list('goals'),{id:id(),text,done:false}])){$('objetivo').value='';render();show('Objetivo guardado localmente.');}else show('No se pudo guardar.');},'Guardar objetivo');
        section.querySelector('.section-description').textContent='Los objetivos se guardan en este navegador. Evita datos médicos sensibles.';render();
    }
    if($('buscar')){
        const heading=document.querySelector('.page-heading p');if(heading)heading.textContent='Busca y revisa las conversaciones guardadas con tu autorización.';
        const section=$('buscar').closest('.content-panel');section.querySelector('.empty-state')?.remove();section.querySelector('.demo-label')?.remove();$('buscar').disabled=false;
        section.querySelector('.section-description').textContent='Historial local opcional. Actívalo en Configuración; puedes borrar los datos en cualquier momento.';
        const output=node('div',undefined,'saved-items');section.append(output);
        function render(){output.replaceChildren();const q=v('buscar').toLocaleLowerCase('es');
            for(const item of list('history').filter(x=>(x.question+' '+x.answer).toLocaleLowerCase('es').includes(q))){
                const card=node('details',undefined,'saved-row');card.append(node('summary',item.question.slice(0,120)),node('p',item.question),node('p',item.answer),node('p',item.disclosure||'Respuesta anterior: no se verificaron sus fuentes.','muted-copy'),node('p','Regla: '+(item.rule||'no registrada')+' · '+sourceNotice(Array.isArray(item.sources)?item.sources:[]),'muted-copy'),button('Copiar respuesta',()=>copy(item.answer+'\n\n'+(item.disclosure||'Respuesta anterior sin fuentes verificadas.')+'\n'+sourceNotice(Array.isArray(item.sources)?item.sources:[])),'small-action'),button('Eliminar',()=>{if(save('history',list('history').filter(x=>x.id!==item.id)))render();},'small-action'));output.append(card);
            }if(!output.children.length)output.append(node('p','No hay conversaciones que coincidan.','muted-copy'));}
        $('buscar').addEventListener('input',render);render();
    }
    if(document.querySelector('h1')?.textContent==='Favoritos'){
        const section=document.querySelector('.content-panel');section.querySelector('.empty-state')?.remove();section.querySelector('.section-description').textContent='Temas guardados en este navegador.';
        const output=node('div',undefined,'saved-items');section.append(output);
        function render(){output.replaceChildren();for(const item of list('favorites')){
            const row=node('div',undefined,'saved-row');row.append(node('strong',item.title),button('Consultar',()=>queue('Quiero información general sobre '+item.title+'.'),'small-action'),button('Eliminar',()=>{if(save('favorites',list('favorites').filter(x=>x.title!==item.title||x.page!==item.page)))render();},'small-action'));output.append(row);
        }if(!output.children.length)output.append(node('p','Aún no tienes favoritos.','muted-copy'));}render();
    }
    if($('tema')){
        const heading=document.querySelector('.page-heading p');if(heading)heading.textContent='Personaliza la apariencia y decide qué información se guarda localmente.';
        const s=$('tema').closest('.content-panel');s.querySelector('.demo-label')?.remove();s.querySelector('.section-description').textContent='Ajustes locales de apariencia y privacidad.';
        $('tema').disabled=false;$('tema').value=prefs().theme;$('tema').addEventListener('change',()=>{document.documentElement.dataset.medaiTheme=v('tema')==='Claro'?'light':'dark';document.documentElement.dataset.bsTheme=v('tema')==='Claro'?'light':'dark';});
        const field=$('notificaciones').closest('.field');field.querySelector('label').textContent='Guardar historial de consultas en este navegador (opcional)';
        const opt=$('notificaciones');opt.disabled=false;opt.value=prefs().history?'Activadas':'Desactivadas';
        const action=s.querySelector('.action-button');action.disabled=false;action.textContent='Guardar preferencias';
        action.addEventListener('click',()=>{if(opt.value==='Activadas'&&!prefs().history&&!confirm('El historial puede contener datos sensibles y quedará en este dispositivo. ¿Activar?')){opt.value='Desactivadas';return;}if(save('prefs',{theme:v('tema'),history:opt.value==='Activadas'})){applyTheme();show('Preferencias guardadas.');}else show('No se pudo guardar.');});
        const privacy=s.nextElementSibling;privacy.querySelector('.section-description').textContent='No hay cuentas. Las preferencias, favoritos y objetivos son locales; el historial solo se guarda si lo activas.';
        privacy.querySelector('.muted-copy').textContent='Borra los datos locales si compartes este dispositivo. Los servicios API externos pueden aplicar sus propias políticas.';
        privacy.append(button('Borrar datos locales',()=>{if(confirm('¿Borrar historial, favoritos, objetivos y preferencias de MedAI?')){try{for(const key of ['prefs','history','goals','favorites'])localStorage.removeItem('medai:'+key);sessionStorage.removeItem('medai:draft');location.reload();}catch{show('No se pudieron borrar los datos.');}}}));
    }
    if(document.querySelector('h1')?.textContent==='Ayuda'){
        const items=document.querySelectorAll('.faq-list details p');
        if(items.length>=3){items[0].textContent='MedAI ofrece orientación general mediante reglas locales y fuentes revisadas. La generación clínica mediante modelos permanece bloqueada.';items[1].textContent='No. MedAI no sustituye una valoración profesional. Busca atención médica ante una emergencia.';items[2].textContent='El historial está desactivado por defecto. Los objetivos y favoritos son locales; los proveedores externos reciben información únicamente al usar sus funciones. Puedes borrar los datos locales en Configuración.';}
    }
    if($('correo-soporte')){
        const form=$('correo-soporte').closest('form');form.querySelector('fieldset').disabled=false;
        $('correo-soporte').required=true;$('mensaje-soporte').required=true;
        $('estado-soporte').textContent='Si no existe una API de soporte, puedes descargar tu solicitud. No se enviará automáticamente.';
        const action=form.querySelector('.action-button');action.disabled=false;action.textContent='Enviar solicitud';
        const payload=()=>({email:v('correo-soporte'),reason:redactPersonalData(v('motivo-soporte')),message:redactPersonalData(v('mensaje-soporte'))});
        const valid=()=>form.reportValidity()&&!!v('mensaje-soporte')&&v('motivo-soporte')!=='Seleccionar motivo';
        form.addEventListener('submit',e=>e.preventDefault());
        action.addEventListener('click',async()=>{if(!valid())return show('Completa correo, motivo y descripción.');if(!confirm('¿Autorizar el envío del correo de contacto y descripción depurada al servicio de soporte (no al modelo de IA)? No incluyas datos de salud. No se autoriza entrenamiento ni evaluación.'))return;action.disabled=true;try{const r=await api('support',payload());if(r.accepted!==true)throw Error('El servicio no confirmó la recepción.');show('Solicitud recibida por soporte.');form.reset();}catch(e){show(e.message+' No se confirmó el envío. Puedes descargar la solicitud.');}finally{action.disabled=false;}});
        form.append(button('Descargar solicitud',()=>{if(!valid())return show('Completa los campos.');const p=payload();download('Correo: '+p.email+'\nMotivo: '+p.reason+'\n\n'+p.message,'medai-soporte.txt');show('Solicitud descargada; no se ha enviado.');}));
    }
}
reviseUI();
sections();
