import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeSamples,encodeWav} from '../public/js/audio.js';
test('PCM silencioso y señal detectable',()=>{const silence=analyzeSamples(new Float32Array(16000),16000);assert.equal(silence.seconds,1);assert.equal(silence.rms,0);assert.equal(silence.peak,0);assert.ok(analyzeSamples(new Float32Array(16000).fill(0.1),16000).rms>0.09);});
test('WAV mono PCM 16 bits, 16 kHz y tamaños correctos',()=>{const b=encodeWav(new Float32Array([-1,0,1]));const v=new DataView(b);assert.equal(b.byteLength,50);assert.equal(v.getUint32(24,true),16000);assert.equal(v.getUint16(22,true),1);assert.equal(v.getUint16(34,true),16);assert.equal(v.getInt16(44,true),-32768);assert.equal(v.getInt16(48,true),32767);});
