import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getProviders} from '../services/providerConfig.js';
const env={GROQ_API_KEY:'fake',MEDAI_PROVIDER_POLICY_REVIEWED:'true',MEDAI_GROQ_AUDIO_APPROVED:'true',MEDAI_PROVIDER_CONFIG:'{}'};
test('Preset Whisper no necesita JSON manual',()=>{
    const [p]=getProviders('transcribe',env);
    assert.equal(p.model,'whisper-large-v3');
    assert.equal(p.tokenEnv,'GROQ_API_KEY');
    assert.equal(p.url,'https://api.groq.com/openai/v1/audio/transcriptions');
});
test('Preset requiere clave y las dos aprobaciones',()=>{
    for(const key of ['GROQ_API_KEY','MEDAI_PROVIDER_POLICY_REVIEWED','MEDAI_GROQ_AUDIO_APPROVED'])assert.deepEqual(getProviders('transcribe',{...env,[key]:''}),[]);
});
test('Config explícita y errores no se sobreescriben',()=>{
    for(const json of ['{"transcribe":[]}','invalid','null'])assert.deepEqual(getProviders('transcribe',{...env,MEDAI_PROVIDER_CONFIG:json}),[]);
    assert.deepEqual(getProviders('chat',env),[]);
});
