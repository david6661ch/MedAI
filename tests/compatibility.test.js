import {test} from 'node:test';
import assert from 'node:assert/strict';
import {audioMime,audioExtension,sniffAudio,recorderFormats} from '../public/js/audio.js';
test('Formatos de Safari, Android, Firefox y grabadoras nativas',()=>{
    for(const [type,name,mime,ext] of [['audio/mp4;codecs=mp4a.40.2','','audio/mp4','m4a'],['','voz.M4A','audio/mp4','m4a'],['application/octet-stream','voz.ogg','audio/ogg','ogg'],['audio/webm;codecs=opus','','audio/webm','webm'],['audio/wave','','audio/wave','wav'],['audio/mpga','','audio/mpga','mpga']]){
        assert.equal(audioMime(type,name),mime);assert.equal(audioExtension(mime),ext);
    }
    assert.equal(audioMime('image/png','voz.m4a'),'');assert.equal(audioMime('','malware.exe'),'');
});
test('Detección de formatos cuando el dispositivo omite MIME',()=>{
    assert.equal(sniffAudio(Buffer.from('RIFF1234WAVE')),'audio/wav');
    assert.equal(sniffAudio(Buffer.from('1234ftyp')),'audio/mp4');
    assert.equal(sniffAudio(Buffer.from('OggS')),'audio/ogg');
    assert.equal(sniffAudio(Buffer.from('fLaC')),'audio/flac');
    assert.equal(sniffAudio(Buffer.from([0x1a,0x45,0xdf,0xa3])),'audio/webm');
    assert.equal(sniffAudio(Buffer.from('texto')),'');
});
test('Selección por capacidades sin identificar navegador',()=>{
    assert.deepEqual(recorderFormats({isTypeSupported:t=>t==='audio/mp4'}),['audio/mp4',null]);
    assert.deepEqual(recorderFormats({isTypeSupported:t=>t==='audio/ogg;codecs=opus'}),['audio/ogg;codecs=opus',null]);
    assert.deepEqual(recorderFormats({}),[null]);
    assert.deepEqual(recorderFormats(null),[]);
});
