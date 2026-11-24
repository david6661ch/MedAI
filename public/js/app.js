import { API_BASE } from './api-config.js';

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
        method: 'POST', headers: { 'Content-Type': type },
        body: type === 'application/json' ? JSON.stringify(payload) : payload,
        signal: AbortSignal.timeout(90000), cache: 'no-store'
    });
    if (!response.ok) {
        if (response.status === 503) throw Error('Esta API todavía no está configurada.');
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
        sessionStorage.setItem('medai:draft', text);
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
    const info = node('p', 'Puedes escribir, dictar o adjuntar audio/texto. Revisa siempre los nombres, dosis y negaciones antes de enviar. Los audios se procesan solo con tu autorización.', 'muted-copy');
    const review = node('section', undefined, 'content-panel transcript-review');
    review.hidden = true;
    review.append(node('h2','Revisar texto antes de enviar'));
    const originalLabel = node('label','Texto original o transcripción');
    const original = node('textarea',undefined,'form-control'); original.id='transcript-original'; original.readOnly=true; original.rows=3; originalLabel.htmlFor=original.id;
    const editedLabel = node('label','Texto revisado (editable)');
    const edited = node('textarea',undefined,'form-control'); edited.id='transcript-edited'; edited.rows=4; editedLabel.htmlFor=edited.id;
    review.append(originalLabel, original, editedLabel, edited);
    let revisionVersion = 0, busy = false, recorder, stream, recognition, recording = false;
    const transcript = (text) => {
        revisionVersion++;
        original.value = text;
        edited.value = localRevision(text);
        review.hidden = false;
        edited.focus();
        show('Revisa el texto antes de usarlo. No se ha enviado ninguna consulta.');
    };
    const revised = button('Mejorar redacción con API', async () => {
        if (!edited.value.trim()) return show('No hay texto para revisar.');
        if (!confirm('¿Enviar este texto al proveedor de corrección configurado?')) return;
        const version = ++revisionVersion;
        const before = edited.value;
        revised.disabled = true;
        try {
            const r = await api('revise',{text: before});
            if (version === revisionVersion && edited.value === before && typeof r.text === 'string' && r.text.trim()) {
                edited.value = r.text; show('Compara con el original y verifica que no cambie el significado.');
            }
        } catch(e) { show(e.message + ' Puedes editar el texto manualmente.'); }
        finally { revised.disabled = false; }
    });
    review.append(revised, button('Usar texto revisado', () => {
        if (!edited.value.trim()) return show('El texto está vacío.');
        revisionVersion++;
        input.value = edited.value; input.dispatchEvent(new Event('input'));
        review.hidden = true; original.value = ''; edited.value = ''; input.focus();
        show('Texto preparado. Pulsa Enviar cuando estés listo.');
    }), button('Descartar', () => { revisionVersion++; review.hidden=true; original.value=''; edited.value=''; show('Revisión descartada.'); }));
    const chatLog = node('section',undefined,'chat-log');
    chatLog.setAttribute('aria-label','Conversación'); chatLog.setAttribute('aria-live','polite');
    const content = main.querySelector('.main-content');
    content?.append(chatLog);
    const audioFile = node('input'); audioFile.type='file'; audioFile.accept='audio/*,.webm,.m4a,.mp3,.wav,.ogg,.txt,text/plain'; audioFile.hidden=true;
    async function transcribe(blob) {
        if (busy || recording || recognition) return show('Termina primero la operación de audio.');
        if (blob.size === 0 || blob.size > 10*1024*1024) return show('El audio debe tener entre 1 byte y 10 MB.');
        if (!confirm('El audio se enviará al servicio de transcripción configurado. Evita incluir datos identificables. ¿Continuar?')) return;
        busy=true; send.disabled=true; mic.disabled=true; attach.disabled=true;
        show('Transcribiendo audio…');
        try {
            const mime = (blob.type || 'application/octet-stream').split(';')[0];
            const r = await api('transcribe',blob,mime);
            if (typeof r.text !== 'string' || !r.text.trim()) throw Error('No se recibió una transcripción utilizable.');
            transcript(r.text);
        } catch(e) { show(e.message + ' Puedes escribir la consulta o usar dictado del navegador.'); }
        finally { busy=false; send.disabled=false; mic.disabled=false; attach.disabled=false; }
    }
    audioFile.addEventListener('change',async () => {
        const file=audioFile.files[0]; audioFile.value='';
        if(!file) return;
        if(file.type==='text/plain'||file.name.toLowerCase().endsWith('.txt')){
            if(file.size>100000) return show('El archivo de texto supera 100 KB.');
            transcript(await file.text());
        } else await transcribe(file);
    });
    attach.disabled=false; attach.setAttribute('aria-label','Adjuntar audio o archivo de texto');
    attach.title='Adjuntar audio o texto';
    attach.addEventListener('click',()=>audioFile.click());
    tools.append(audioFile,button('Revisar redacción',()=>{if(input.value.trim())transcript(input.value);else show('Escribe un texto primero.');},'small-action'));
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    mic.disabled=false; mic.setAttribute('aria-label','Iniciar o detener dictado'); mic.title='Dictar consulta';
    mic.addEventListener('click',()=>{
        if (recognition) {recognition.stop();return;}
        if (busy || recording) return show('Termina primero la operación de audio.');
        if (!Speech) return show('Este navegador no admite dictado directo. Usa Grabar audio o adjunta un archivo.');
        if (!confirm('El navegador puede enviar tu voz a su proveedor de reconocimiento. Evita datos identificables. ¿Activar micrófono?')) return;
        let finalText='', interim='';
        recognition=new Speech(); recognition.lang='es-CO'; recognition.continuous=true; recognition.interimResults=true;
        recognition.onresult=e=>{
            interim='';
            for(let i=e.resultIndex;i<e.results.length;i++){
                const part=e.results[i][0].transcript;
                if(e.results[i].isFinal)finalText+=part+' ';else interim+=part;
            }
            show('Dictando… '+interim);
        };
        recognition.onerror=e=>show('No se pudo dictar: '+e.error);
        recognition.onend=()=>{ recognition=null; mic.classList.remove('recording'); if(finalText.trim())transcript(finalText.trim());else show('No se obtuvo una transcripción final.'); };
        try { recognition.start(); mic.classList.add('recording'); show('Escuchando. Pulsa el micrófono otra vez para detener.'); }
        catch(e){recognition=null;show('No se pudo iniciar el micrófono.');}
    });
    const record = button('Grabar audio',async ()=>{
        if(recording){recorder.stop();return;}
        if(busy||recognition)return show('Termina primero el dictado o la operación en curso.');
        if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)return show('La grabación requiere un navegador compatible y HTTPS.');
        if(!apiBase())return show('La grabación necesita una API de transcripción. Puedes probar el dictado del navegador.');
        if(!confirm('¿Permitir grabación local? Podrás decidir después si envías el audio a transcripción.'))return;
        try{
            stream=await navigator.mediaDevices.getUserMedia({audio:true});
            const chunks=[]; let size=0;
            recorder=new MediaRecorder(stream);
            recorder.ondataavailable=e=>{size+=e.data.size;if(size<=10*1024*1024)chunks.push(e.data);else if(recorder.state==='recording')recorder.stop();};
            recorder.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());recording=false;record.textContent='Grabar audio';send.disabled=false;mic.disabled=false;attach.disabled=false;if(size>10*1024*1024)return show('Grabación demasiado larga.');await transcribe(new Blob(chunks,{type:recorder.mimeType}));};
            recorder.onerror=()=>{stream.getTracks().forEach(t=>t.stop());recording=false;record.textContent='Grabar audio';send.disabled=false;mic.disabled=false;attach.disabled=false;show('Error al grabar.');};
            recorder.start(1000);recording=true;record.textContent='Detener grabación';send.disabled=true;mic.disabled=true;attach.disabled=true;show('Grabando audio…');
        }catch{stream?.getTracks().forEach(t=>t.stop());show('No se pudo acceder al micrófono.');}
    },'small-action');
    tools.append(record);
    const chatStatus=node('p','','app-status');chatStatus.setAttribute('role','status');
    // Mantener el estado de voz y errores junto a la barra persistente.
    composer.prepend(status);
    composer.querySelector('.composer').after(tools,info,chatStatus);
    content?.append(review);
    function bubble(role,text){
        const item=node('article',undefined,'assistant-message '+(role==='Tú'?'user-message':''));
        item.append(node('strong',role),node('p',text));chatLog.append(item);item.scrollIntoView({block:'nearest'});
    }
    send.disabled=false;send.setAttribute('aria-label','Enviar consulta');send.title='Enviar consulta';
    async function submit(){
        if(busy||recording||recognition||!review.hidden)return show('Termina la revisión o grabación antes de enviar.');
        const question=input.value.trim();if(!question)return show('Escribe una consulta.');
        if(question.length>12000)return show('La consulta supera 12.000 caracteres.');
        let base;try{base=apiBase();}catch(e){return show(e.message);}
        if(!base)return show('API de respuestas no configurada. Tu consulta permanece en el campo de texto.');
        if(!confirm('¿Enviar el texto revisado al servicio de respuestas de salud configurado?'))return;
        busy=true;send.disabled=true;mic.disabled=true;attach.disabled=true;record.disabled=true;
        chatStatus.textContent='Consultando…';bubble('Tú',question);
        try{
            const r=await api('chat',{message:question});
            const answer=typeof r.text==='string'&&r.text.trim()?r.text:notice;
            bubble('MedAI',answer);
            if(prefs().history&&!save('history',[{id:id(),question,answer,date:new Date().toISOString()},...list('history')].slice(0,100)))show('No se pudo guardar el historial.');
            if(input.value.trim()===question){input.value='';input.dispatchEvent(new Event('input'));}
            chatStatus.textContent='Respuesta recibida. Verifica la información.';
        }catch(e){bubble('MedAI',notice);chatStatus.textContent=e.message+' Tu texto sigue disponible.';}
        finally{busy=false;send.disabled=false;mic.disabled=false;attach.disabled=false;record.disabled=false;}
    }
    send.addEventListener('click',submit);
    input.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();submit();}});
    try{const draft=sessionStorage.getItem('medai:draft');if(draft){sessionStorage.removeItem('medai:draft');transcript(draft);}}catch{}
    window.addEventListener('pagehide',()=>{recognition?.abort();stream?.getTracks().forEach(t=>t.stop());});
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
        activate('objetivo',()=>{const text=v('objetivo');if(!text)return show('Escribe un objetivo.');if(text.length>200)return show('Máximo 200 caracteres.');if(save('goals',[...list('goals'),{id:id(),text,done:false}])){$('objetivo').value='';render();show('Objetivo guardado localmente.');}else show('No se pudo guardar.');},'Guardar objetivo');
        section.querySelector('.section-description').textContent='Los objetivos se guardan en este navegador. Evita datos médicos sensibles.';render();
    }
    if($('buscar')){
        const heading=document.querySelector('.page-heading p');if(heading)heading.textContent='Busca y revisa las conversaciones guardadas con tu autorización.';
        const section=$('buscar').closest('.content-panel');section.querySelector('.empty-state')?.remove();section.querySelector('.demo-label')?.remove();$('buscar').disabled=false;
        section.querySelector('.section-description').textContent='Historial local opcional. Actívalo en Configuración; puedes borrar los datos en cualquier momento.';
        const output=node('div',undefined,'saved-items');section.append(output);
        function render(){output.replaceChildren();const q=v('buscar').toLocaleLowerCase('es');
            for(const item of list('history').filter(x=>(x.question+' '+x.answer).toLocaleLowerCase('es').includes(q))){
                const card=node('details',undefined,'saved-row');card.append(node('summary',item.question.slice(0,120)),node('p',item.question),node('p',item.answer),button('Copiar respuesta',()=>copy(item.answer),'small-action'),button('Eliminar',()=>{if(save('history',list('history').filter(x=>x.id!==item.id)))render();},'small-action'));output.append(card);
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
        if(items.length>=3){items[0].textContent='MedAI ofrece herramientas de orientación general y preparación de consultas de salud. Las respuestas requieren una API configurada.';items[1].textContent='No. MedAI no sustituye una valoración profesional. Busca atención médica ante una emergencia.';items[2].textContent='El historial está desactivado por defecto. Los objetivos y favoritos son locales; los proveedores externos reciben información únicamente al usar sus funciones. Puedes borrar los datos locales en Configuración.';}
    }
    if($('correo-soporte')){
        const form=$('correo-soporte').closest('form');form.querySelector('fieldset').disabled=false;
        $('correo-soporte').required=true;$('mensaje-soporte').required=true;
        $('estado-soporte').textContent='Si no existe una API de soporte, puedes descargar tu solicitud. No se enviará automáticamente.';
        const action=form.querySelector('.action-button');action.disabled=false;action.textContent='Enviar solicitud';
        const payload=()=>({email:v('correo-soporte'),reason:v('motivo-soporte'),message:v('mensaje-soporte')});
        const valid=()=>form.reportValidity()&&!!v('mensaje-soporte')&&v('motivo-soporte')!=='Seleccionar motivo';
        form.addEventListener('submit',e=>e.preventDefault());
        action.addEventListener('click',async()=>{if(!valid())return show('Completa correo, motivo y descripción.');if(!confirm('¿Enviar estos datos al servicio de soporte configurado?'))return;action.disabled=true;try{const r=await api('support',payload());if(r.accepted!==true)throw Error('El servicio no confirmó la recepción.');show('Solicitud recibida por soporte.');form.reset();}catch(e){show(e.message+' No se confirmó el envío. Puedes descargar la solicitud.');}finally{action.disabled=false;}});
        form.append(button('Descargar solicitud',()=>{if(!valid())return show('Completa los campos.');const p=payload();download('Correo: '+p.email+'\nMotivo: '+p.reason+'\n\n'+p.message,'medai-soporte.txt');show('Solicitud descargada; no se ha enviado.');}));
    }
}
reviseUI();
sections();
