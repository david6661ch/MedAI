import {test} from 'node:test';
import assert from 'node:assert/strict';
import {server} from '../server.js';
import {POLICY_VERSION} from '../public/js/ethics.js';
import {validAccess,reserveDemoRequest} from '../services/publicAccess.js';
test('Demo protege API y conserva consentimiento',async()=>{
    const code='a'.repeat(40);
    assert.equal(validAccess(undefined,{MEDAI_PUBLIC_BACKEND:'true'}),false);
    assert.equal(validAccess('Bearer '+code,{MEDAI_PUBLIC_BACKEND:'true',MEDAI_DEMO_ACCESS_CODE:code}),true);
    const previous={...process.env};
    Object.assign(process.env,{MEDAI_PUBLIC_BACKEND:'true',MEDAI_DEMO_ACCESS_CODE:code,MEDAI_ALLOWED_ORIGINS:'https://david6661ch.github.io'});
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const base='http://127.0.0.1:'+server.address().port;
    const post=(authorization,consent=true)=>fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://david6661ch.github.io',...(authorization?{Authorization:authorization}:{}),...(consent?{'X-MedAI-Consent':JSON.stringify({version:POLICY_VERSION,operation:'chat',accepted:true})}:{})},body:JSON.stringify({message:'Prueba'})});
    try{
        assert.equal((await (await fetch(base+'/api/status')).json()).accessRequired,true);
        assert.equal((await post()).status,401);
        assert.equal((await post('Bearer wrong')).status,401);
        assert.equal((await post('Bearer '+code,false)).status,403);
        assert.equal((await post('Bearer '+code)).status,200);
        const preflight=await fetch(base+'/api/transcribe',{method:'OPTIONS',headers:{Origin:'https://david6661ch.github.io','Access-Control-Request-Headers':'authorization,content-type,x-medai-consent'}});
        assert.equal(preflight.status,204);assert.match(preflight.headers.get('access-control-allow-headers'),/Authorization/);
        assert.equal((await fetch(base+'/api/status',{headers:{Origin:'https://otro.example'}})).status,403);
    }finally{for(const k of ['MEDAI_PUBLIC_BACKEND','MEDAI_DEMO_ACCESS_CODE','MEDAI_ALLOWED_ORIGINS']){if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];}await new Promise(r=>server.close(r));}
});
test('Límite de concurrencia y presupuesto diario de demo',()=>{
    const date=new Date('2099-01-01T00:00:00Z');const a=reserveDemoRequest(date),b=reserveDemoRequest(date);
    assert.ok(a&&b);assert.equal(reserveDemoRequest(date),null);a();b();
    for(let i=0;i<58;i++){const release=reserveDemoRequest(date);assert.ok(release);release();}
    assert.equal(reserveDemoRequest(date),null);
    const next=reserveDemoRequest(new Date('2099-01-02T00:00:00Z'));assert.ok(next);next();
});
