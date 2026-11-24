import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, readdir, access } from 'node:fs/promises';
import { server } from '../server.js';

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
    for(const path of ['js/app.js','js/api-config.js','js/composer.js','css/styles.css']){
        const a=await readFile(new URL('../public/'+path,import.meta.url));
        const b=await readFile(new URL(path,root));
        assert.deepEqual(a,b);
    }
});

test('Gateway de prueba: datos ficticios, proveedores alternativos y errores', async () => {
    const upstream=createServer(async(req,res)=>{
        const chunks=[];for await(const chunk of req)chunks.push(chunk);
        const data=Buffer.concat(chunks);
        if(req.url==='/fail'){res.writeHead(503);return res.end();}
        if(req.headers.authorization!=='Bearer mock-key'){res.writeHead(401);return res.end();}
        res.setHeader('Content-Type','application/json');
        if(req.url==='/audio')return res.end(JSON.stringify({text:'Texto de prueba'}));
        const input=JSON.parse(data);
        if(req.url==='/support')return res.end(JSON.stringify({accepted:true}));
        if(req.url==='/revise')return res.end(JSON.stringify({text:input.text.trim()}));
        assert.ok(input.instructions.includes('No tengo esa información'));
        res.end(JSON.stringify({text:'Respuesta ficticia para la prueba de integración'}));
    });
    await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const root='http://127.0.0.1:'+upstream.address().port;
    const base='http://127.0.0.1:'+server.address().port;
    const previous=process.env.MEDAI_PROVIDER_CONFIG;
    const previousKey=process.env.MEDAI_TEST_KEY;
    process.env.MEDAI_TEST_KEY='mock-key';
    process.env.MEDAI_PROVIDER_CONFIG=JSON.stringify({
        chat:[{url:root+'/fail'},{url:root+'/chat',tokenEnv:'MEDAI_TEST_KEY'}],
        revise:[{url:root+'/revise',tokenEnv:'MEDAI_TEST_KEY'}],
        transcribe:[{url:root+'/audio',tokenEnv:'MEDAI_TEST_KEY'}],
        support:[{url:root+'/support',tokenEnv:'MEDAI_TEST_KEY'}]
    });
    const post=(path,payload,mime='application/json')=>fetch(base+'/api/'+path,{method:'POST',headers:{'Content-Type':mime},body:mime==='application/json'?JSON.stringify(payload):payload});
    try{
        assert.equal((await (await fetch(base+'/api/status')).json()).chat,true);
        assert.equal((await (await post('chat',{message:'Ejemplo ficticio'})).json()).text,'Respuesta ficticia para la prueba de integración');
        assert.equal((await (await post('revise',{text:' prueba '})).json()).text,'prueba');
        assert.equal((await (await post('transcribe',Buffer.from('audio-ficticio'),'audio/wav')).json()).text,'Texto de prueba');
        assert.equal((await (await post('support',{email:'test@example.com',reason:'Prueba',message:'Prueba ficticia'})).json()).accepted,true);
        assert.equal((await post('chat',{message:''})).status,400);
        assert.equal((await fetch(base+'/api/status',{headers:{Origin:'https://evil.example'}})).status,403);
        assert.equal((await fetch(base+'/.env')).status,404);
        delete process.env.MEDAI_PROVIDER_CONFIG;
        assert.equal((await post('chat',{message:'Prueba'})).status,503);
    } finally{
        if(previous===undefined)delete process.env.MEDAI_PROVIDER_CONFIG;else process.env.MEDAI_PROVIDER_CONFIG=previous;
        if(previousKey===undefined)delete process.env.MEDAI_TEST_KEY;else process.env.MEDAI_TEST_KEY=previousKey;
        await Promise.all([new Promise(r=>server.close(r)),new Promise(r=>upstream.close(r))]);
    }
});
