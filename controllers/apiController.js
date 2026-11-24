import { Buffer } from 'node:buffer';

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
        return Array.isArray(parsed[operation]) ? parsed[operation].filter(p=>p && typeof p.url==='string') : [];
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
    if(operation==='chat'&&str(data.message,12000))return {message:data.message};
    if(operation==='revise'&&str(data.text,20000))return {text:data.text};
    if(operation==='support'&&str(data.email,254)&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)&&str(data.reason,100)&&str(data.message,5000))return {email:data.email,reason:data.reason,message:data.message};
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
        data=new FormData(); data.append('file',new Blob([payload],{type:mime}),'audio.'+ext);data.append('model',provider.model);data.append('language','es');
    }else if(operation==='transcribe'){
        headers['Content-Type']=mime;data=payload;
    }else{
        headers['Content-Type']='application/json';
        data=JSON.stringify({...payload,...(operation==='chat'?{instructions:safety}:operation==='revise'?{instructions:editing}:{})});
    }
    const response=await fetch(url,{method:'POST',headers,body:data,signal:AbortSignal.timeout(40000),redirect:'error'});
    if(!response.ok)throw Error('provider failed');
    const chunks=[];let size=0;
    for await(const chunk of response.body){size+=chunk.length;if(size>1024*1024)throw Error('response too large');chunks.push(Buffer.from(chunk));}
    const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(operation==='support'){if(result.accepted!==true)throw Error('not confirmed');return {accepted:true};}
    const text=provider.kind==='openai'&&operation!=='transcribe'?result.choices?.[0]?.message?.content:result.text;
    if(typeof text!=='string'||!text.trim()||text.length>40000)throw Error('invalid response');
    return {text};
}
export async function handleApi(req,res,path){
    const operation=path.slice('/api/'.length);
    if(!allowedOrigin(req)){return json(res,403,{error:'Origin not allowed'});}
    if(req.headers.origin){res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Vary','Origin');}
    if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600'});res.end();return;}
    if(operation==='status'&&req.method==='GET')return json(res,200,{chat:!!configured('chat').length,revise:!!configured('revise').length,transcribe:!!configured('transcribe').length,support:!!configured('support').length});
    if(!Object.hasOwn(limits,operation))return json(res,404,{error:'Not found'});
    if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
    const providers=configured(operation);
    if(!providers.length)return json(res,503,{error:'Provider not configured'});
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
    // Evita duplicar solicitudes de soporte; para otros servicios solo hay fallback
    // si el administrador configuró explícitamente varios proveedores.
    for(const provider of providers.slice(0,operation==='support'?1:2)){
        try{return json(res,200,await upstream(operation,provider,payload,mime));}
        catch{/* No registrar datos de pacientes, claves ni respuestas del proveedor. */}
    }
    return json(res,502,{error:'Provider unavailable'});
}
