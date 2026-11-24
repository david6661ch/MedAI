import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, readdir, access } from 'node:fs/promises';
import { server } from '../server.js';
import { POLICY_VERSION } from '../public/js/ethics.js';

test('Exportación estática: páginas, enlaces y recursos', async () => {
    const root = new URL('../docs/', import.meta.url);
    const files = (await readdir(root)).filter(x => x.endsWith('.html'));
    assert.equal(files.length, 14);
    for (const file of files) {
        const html = await readFile(new URL(file, root),'utf8');
        assert.doesNotMatch(html, /\{\{\w+\}\}/);
        assert.match(html, /Soy una IA, puedo cometer errores/);
        assert.match(html, /<script type="module" src="(?:\.\/|\/MedAI\/)js\/app\.js"/);
        for(const [,path] of html.matchAll(/(?:href|src)="((?:\.\/|\/MedAI\/)[^"]+)"/g)){
            await access(new URL(path.replace(/^(?:\.\/|\/MedAI\/)/,''),root));
        }
    }
    for(const path of ['js/app.js','js/api-config.js','js/composer.js','js/ethics.js','css/styles.css']){
        const a=await readFile(new URL('../public/'+path,import.meta.url));
        const b=await readFile(new URL(path,root));
        assert.deepEqual(a,b);
    }
});

test('Gateway de prueba: datos ficticios, proveedores alternativos y errores', async () => {
    const received=[];
    const upstream=createServer(async(req,res)=>{
        const chunks=[];for await(const chunk of req)chunks.push(chunk);
        const data=Buffer.concat(chunks);
        if(req.url==='/fail'){res.writeHead(503);return res.end();}
        if(req.headers.authorization!=='Bearer mock-key'){res.writeHead(401);return res.end();}
        res.setHeader('Content-Type','application/json');
        received.push(req.url);
        if(req.url==='/audio')return res.end(JSON.stringify({text:'Texto de prueba, a@b.co'}));
        const input=JSON.parse(data);
        if(req.url==='/support')return res.end(JSON.stringify({accepted:true}));
        if(req.url==='/revise'){assert.equal(input.text,' prueba [correo] [celular] [documento] ');return res.end(JSON.stringify({text:input.text.trim()}));}
        assert.ok(input.instructions.includes('No tengo esa información'));
        res.end(JSON.stringify({text:'Respuesta ficticia para la prueba de integración'}));
    });
    await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const root='http://127.0.0.1:'+upstream.address().port;
    const base='http://127.0.0.1:'+server.address().port;
    const previous=process.env.MEDAI_PROVIDER_CONFIG;
    const previousKey=process.env.MEDAI_TEST_KEY;
    const previousPolicy=process.env.MEDAI_PROVIDER_POLICY_REVIEWED;
    process.env.MEDAI_PROVIDER_POLICY_REVIEWED='true';
    process.env.MEDAI_TEST_KEY='mock-key';
    process.env.MEDAI_PROVIDER_CONFIG=JSON.stringify({
        chat:[{url:root+'/chat',tokenEnv:'MEDAI_TEST_KEY',noTraining:true}],
        revise:[{url:root+'/fail',noTraining:true},{url:root+'/revise',tokenEnv:'MEDAI_TEST_KEY',noTraining:true}],
        transcribe:[{url:root+'/audio',tokenEnv:'MEDAI_TEST_KEY',noTraining:true,rawAudioApproved:true}],
        support:[{url:root+'/support',tokenEnv:'MEDAI_TEST_KEY',noTraining:true}]
    });
    const post=(path,payload,mime='application/json')=>fetch(base+'/api/'+path,{method:'POST',headers:{'Content-Type':mime,'X-MedAI-Consent':JSON.stringify({version:POLICY_VERSION,operation:path,accepted:true})},body:mime==='application/json'?JSON.stringify(payload):payload});
    try{
        assert.equal((await (await fetch(base+'/api/status')).json()).chat,true);
        const chat=await (await post('chat',{message:'Tengo dolor, ¿qué enfermedad tengo?'})).json();
        assert.equal(chat.generatedBy,'rules');assert.equal(chat.rule,'ALTO_IMPACTO');assert.equal(received.length,0);
        assert.equal((await (await post('revise',{text:' prueba a@b.co 3101234567 12345678 '})).json()).text,'prueba [correo] [celular] [documento]');
        assert.equal((await (await post('transcribe',Buffer.from('audio-ficticio'),'audio/wav')).json()).text,'Texto de prueba, [correo]');
        assert.equal((await (await post('support',{email:'test@example.com',reason:'Prueba',message:'Prueba ficticia'})).json()).accepted,true);
        assert.equal((await post('chat',{message:''})).status,400);
        assert.equal((await fetch(base+'/api/status',{headers:{Origin:'https://evil.example'}})).status,403);
        assert.equal((await fetch(base+'/.env')).status,404);
        assert.equal((await fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'Prueba'})})).status,403);
        assert.equal((await fetch(base+'/api/transcribe',{method:'POST',headers:{'Content-Type':'audio/wav'},body:'audio-ficticio'})).status,403);
        process.env.MEDAI_PROVIDER_POLICY_REVIEWED='false';
        assert.equal((await post('revise',{text:'Prueba'})).status,503);
        assert.equal((await post('transcribe',Buffer.from('audio-ficticio'),'audio/wav')).status,503);
        assert.equal(received.filter(x=>x==='/chat').length,0);
        delete process.env.MEDAI_PROVIDER_CONFIG;
        assert.equal((await post('chat',{message:'Prueba'})).status,200);
    } finally{
        if(previous===undefined)delete process.env.MEDAI_PROVIDER_CONFIG;else process.env.MEDAI_PROVIDER_CONFIG=previous;
        if(previousKey===undefined)delete process.env.MEDAI_TEST_KEY;else process.env.MEDAI_TEST_KEY=previousKey;
        if(previousPolicy===undefined)delete process.env.MEDAI_PROVIDER_POLICY_REVIEWED;else process.env.MEDAI_PROVIDER_POLICY_REVIEWED=previousPolicy;
        await Promise.all([new Promise(r=>server.close(r)),new Promise(r=>upstream.close(r))]);
    }
});


test('Whisper: envío multipart, idioma español y errores controlados', async () => {
    let status=200, calls=0;
    const upstream=createServer(async(req,res)=>{
        const chunks=[];for await(const chunk of req)chunks.push(chunk);
        const raw=Buffer.concat(chunks).toString();
        calls++;
        assert.equal(req.headers.authorization,'Bearer fictitious-key');
        assert.match(req.headers['content-type'],/multipart\/form-data; boundary=/);
        assert.match(raw,/name="file"; filename="audio.webm"/);
        assert.match(raw,/name="model"\r\n\r\nwhisper-large-v3/);
        assert.match(raw,/name="language"\r\n\r\nes/);
        assert.match(raw,/name="response_format"\r\n\r\njson/);
        res.writeHead(status,{'Content-Type':'application/json'});
        res.end(JSON.stringify(status===200?{text:'Prueba ficticia en español.'}:{error:'Detalle privado del proveedor'}));
    });
    await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const prior={...process.env};
    process.env.MEDAI_PROVIDER_POLICY_REVIEWED='true';
    process.env.MEDAI_WHISPER_TEST_KEY='fictitious-key';
    process.env.MEDAI_PROVIDER_CONFIG=JSON.stringify({transcribe:[{kind:'openai',url:'http://127.0.0.1:'+upstream.address().port+'/audio/transcriptions',model:'whisper-large-v3',tokenEnv:'MEDAI_WHISPER_TEST_KEY',noTraining:true,rawAudioApproved:true}]});
    const base='http://127.0.0.1:'+server.address().port;
    const post=()=>fetch(base+'/api/transcribe',{method:'POST',headers:{'Content-Type':'audio/webm','X-MedAI-Consent':JSON.stringify({version:POLICY_VERSION,operation:'transcribe',accepted:true})},body:Buffer.from('audio-ficticio')});
    try{
        assert.equal((await (await fetch(base+'/api/status')).json()).transcribe,true);
        assert.equal((await (await post()).json()).text,'Prueba ficticia en español.');
        for(const [s,code] of [[401,'PROVIDER_KEY'],[429,'PROVIDER_QUOTA'],[400,'PROVIDER_AUDIO']]){
            status=s;const response=await post();assert.equal(response.status,502);
            const data=await response.json();assert.equal(data.code,code);
            assert.doesNotMatch(JSON.stringify(data),/fictitious-key|Detalle privado/);
        }
        delete process.env.MEDAI_WHISPER_TEST_KEY;
        assert.equal((await (await fetch(base+'/api/status')).json()).transcribe,false);
        assert.equal((await post()).status,503);
        assert.equal(calls,4);
    }finally{
        for(const key of ['MEDAI_PROVIDER_POLICY_REVIEWED','MEDAI_WHISPER_TEST_KEY','MEDAI_PROVIDER_CONFIG']){
            if(prior[key]===undefined)delete process.env[key];else process.env[key]=prior[key];
        }
        await Promise.all([new Promise(r=>server.close(r)),new Promise(r=>upstream.close(r))]);
    }
});
