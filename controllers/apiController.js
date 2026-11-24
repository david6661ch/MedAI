import { Buffer } from 'node:buffer';
import { redactPersonalData, localGuidance, safeRevision, validConsent, POLICY_VERSION } from '../public/js/ethics.js';

const limits = { chat: 64*1024, revise: 64*1024, support: 32*1024, transcribe: 10*1024*1024 };
const safety = 'Eres MedAI, un asistente de información general de salud, no un profesional médico. Responde en español, con claridad y sin inventar datos o fuentes. Expresa incertidumbre y di "No tengo esa información" si no tienes evidencia suficiente. No diagnostiques ni indiques dosis individualizadas o cambios de tratamiento. Ante signos de emergencia indica buscar atención urgente. Distingue información general de valoración profesional.';
const editing = 'Corrige ortografía, puntuación y legibilidad en español. Devuelve únicamente el texto corregido. Conserva todos los hechos, incertidumbres, nombres, síntomas, fechas, números, unidades, dosis y negaciones. No añadas ni suprimas información médica ni respondas a la consulta. Si hay duda, conserva el texto original.';
const audioTypes = new Set(['audio/webm','video/webm','audio/ogg','application/ogg','audio/wav','audio/x-wav','audio/mpeg','audio/mp3','audio/mp4','video/mp4','audio/x-m4a','audio/aac','audio/flac','application/octet-stream']);
const recent = new Map();
function json(res, code, data) {
    res.writeHead(code, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(JSON.stringify(data));
}
function configured(operation) {
    try {
        const parsed = JSON.parse(process.env.MEDAI_PROVIDER_CONFIG || '{}');
        // Bloqueado por defecto: el responsable debe verificar las condiciones del proveedor.
        if(process.env.MEDAI_PROVIDER_POLICY_REVIEWED !== 'true') return [];
        return Array.isArray(parsed[operation]) ? parsed[operation].filter(p=>p && typeof p.url==='string' && p.noTraining===true && (!p.tokenEnv || !!process.env[p.tokenEnv]?.trim()) && (operation!=='transcribe'||p.rawAudioApproved===true)) : [];
    } catch { return []; }
}
function allowedOrigin(req) {
    const origin = req.headers.origin;
    if (!origin) return true;
    const same = ['http://127.0.0.1','http://localhost','http://[::1]'].some(host => {
        try { const u=new URL(origin);return u.origin===origin&&u.protocol+'//'+u.hostname===host; } catch{return false;}
    });
    return same || (process.env.MEDAI_ALLOWED_ORIGINS || '').split(',').map(s=>s.trim()).includes(origin);
}
async function body(req, limit) {
    const parts=[]; let size=0;
    for await (const chunk of req) {
        size+=chunk.length;
        if(size>limit) { const e=Error('too large');e.status=413;throw e; }
        parts.push(chunk);
    }
    return Buffer.concat(parts);
}
function validate(operation, raw, mime) {
    if(operation==='transcribe'){
        if(!audioTypes.has(mime)||!raw.length)throw Error('audio');
        return raw;
    }
    if(mime!=='application/json')throw Error('json');
    const data=JSON.parse(raw.toString('utf8'));
    const str=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
    if(operation==='chat'&&str(data.message,12000))return {message:redactPersonalData(data.message)};
    if(operation==='revise'&&str(data.text,20000))return {text:redactPersonalData(data.text)};
    if(operation==='support'&&str(data.email,254)&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)&&str(data.reason,100)&&str(data.message,5000))return {email:data.email,reason:redactPersonalData(data.reason),message:redactPersonalData(data.message)};
    throw Error('invalid');
}
async function upstream(operation, provider, payload, mime) {
    const url=new URL(provider.url);
    if(url.protocol!=='https:' && !(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw Error('invalid endpoint');
    if(url.username||url.password)throw Error('invalid endpoint');
    const headers={Accept:'application/json'};
    if(provider.tokenEnv){
        const token=process.env[provider.tokenEnv];
        if(!token)throw Error('missing credentials');
        headers.Authorization='Bearer '+token;
    }
    let data;
    if(provider.kind==='openai'&&['chat','revise'].includes(operation)){
        if(!provider.model)throw Error('missing model');
        headers['Content-Type']='application/json';
        data=JSON.stringify({model:provider.model,messages:[{role:'system',content:operation==='chat'?safety:editing},{role:'user',content:operation==='chat'?payload.message:payload.text}]});
    }else if(provider.kind==='openai'&&operation==='transcribe'){
        if(!provider.model)throw Error('missing model');
        const ext={'audio/mpeg':'mp3','audio/mp3':'mp3','audio/wav':'wav','audio/x-wav':'wav','audio/mp4':'m4a','video/mp4':'mp4','audio/x-m4a':'m4a','audio/ogg':'ogg','application/ogg':'ogg','audio/flac':'flac'}[mime]||'webm';
        data=new FormData(); data.append('file',new Blob([payload],{type:mime}),'audio.'+ext);data.append('model',provider.model);data.append('language','es');data.append('response_format','json');
    }else if(operation==='transcribe'){
        headers['Content-Type']=mime;data=payload;
    }else{
        headers['Content-Type']='application/json';
        data=JSON.stringify({...payload,...(operation==='chat'?{instructions:safety}:operation==='revise'?{instructions:editing}:{})});
    }
    const response=await fetch(url,{method:'POST',headers,body:data,signal:AbortSignal.timeout(40000),redirect:'error'});
    if(!response.ok){
        const error=Error('provider failed');error.code=({400:'PROVIDER_AUDIO',401:'PROVIDER_KEY',403:'PROVIDER_FORBIDDEN',402:'PROVIDER_QUOTA',429:'PROVIDER_QUOTA',413:'PROVIDER_AUDIO',415:'PROVIDER_AUDIO',422:'PROVIDER_AUDIO'})[response.status]||'PROVIDER_UNAVAILABLE';
        await response.body?.cancel();throw error;
    }
    const chunks=[];let size=0;
    for await(const chunk of response.body){size+=chunk.length;if(size>1024*1024)throw Error('response too large');chunks.push(Buffer.from(chunk));}
    const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(operation==='support'){if(result.accepted!==true)throw Error('not confirmed');return {accepted:true};}
    const text=provider.kind==='openai'&&operation!=='transcribe'?result.choices?.[0]?.message?.content:result.text;
    if(typeof text!=='string'||!text.trim()||text.length>40000){const error=Error('invalid response');error.code='PROVIDER_EMPTY';throw error;}
    const redacted=redactPersonalData(text);
    if(operation==='revise' && !safeRevision(payload.text,redacted))throw Error('unsafe revision');
    return {text:redacted,generatedBy:'ai',policyVersion:POLICY_VERSION};
}
export async function handleApi(req,res,path){
    const operation=path.slice('/api/'.length);
    if(!allowedOrigin(req)){return json(res,403,{error:'Origin not allowed'});}
    if(req.headers.origin){res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Vary','Origin');}
    if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, X-MedAI-Consent','Access-Control-Max-Age':'600'});res.end();return;}
    if(operation==='status'&&req.method==='GET')return json(res,200,{chat:true,chatMode:'rules',policyVersion:POLICY_VERSION,revise:!!configured('revise').length,transcribe:!!configured('transcribe').length,support:!!configured('support').length});
    if(!Object.hasOwn(limits,operation))return json(res,404,{error:'Not found'});
    if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
    let consent;
    try { consent=JSON.parse(req.headers['x-medai-consent']||'null'); } catch {}
    if(!validConsent(consent,operation))return json(res,403,{error:'Explicit current consent required'});
    const providers=configured(operation);
    if(operation!=='chat'&&!providers.length)return json(res,503,{error:'Provider not configured or policy not approved'});
    // Límite básico para desarrollo. Un despliegue público requiere autenticación,
    // controles de abuso y privacidad adicionales en un proxy de confianza.
    const key=req.socket.remoteAddress||'unknown',now=Date.now();
    for(const [k,v] of recent)if(now-v.start>60000)recent.delete(k);
    const record=recent.get(key)||{start:now,count:0};
    if(++record.count>15)return json(res,429,{error:'Rate limit'});
    recent.set(key,record);
    let payload,mime;
    try {
        mime=(req.headers['content-type']||'').split(';')[0].toLowerCase();
        payload=validate(operation,await body(req,limits[operation]),mime);
    }catch(e){return json(res,e.status||400,{error:'Invalid or oversized input'});}
    // Control humano y fuentes: no enviar consultas clínicas a un modelo generativo en esta etapa.
    if(operation==='chat')return json(res,200,localGuidance(payload.message));
    // Evita duplicar solicitudes de soporte; para otros servicios solo hay fallback
    // si el administrador configuró explícitamente varios proveedores.
    let code='PROVIDER_UNAVAILABLE';
    for(const provider of providers.slice(0,operation==='support'?1:2)){
        try{return json(res,200,await upstream(operation,provider,payload,mime));}
        catch(error){code=error.code||(['TimeoutError','AbortError'].includes(error.name)?'PROVIDER_TIMEOUT':'PROVIDER_UNAVAILABLE');}
    }
    // Solo códigos controlados: nunca cuerpos de error, claves ni audio.
    return json(res,502,{error:'Provider unavailable',code});
}
