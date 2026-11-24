// PCM mono a 16 kHz. El análisis de amplitud no es detección clínica de voz.
export function analyzeSamples(samples, sampleRate) {
    let sum=0, peak=0, active=0;
    for(const sample of samples){const level=Math.abs(sample);sum+=level*level;peak=Math.max(peak,level);if(level>=0.005)active++;}
    return {seconds:samples.length/sampleRate,peak,rms:Math.sqrt(sum/Math.max(1,samples.length)),activeSeconds:active/sampleRate};
}
export function encodeWav(samples, sampleRate=16000) {
    const buffer=new ArrayBuffer(44+samples.length*2), view=new DataView(buffer);
    const str=(offset,value)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i));};
    str(0,'RIFF');view.setUint32(4,buffer.byteLength-8,true);str(8,'WAVE');str(12,'fmt ');
    view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
    view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);
    str(36,'data');view.setUint32(40,samples.length*2,true);
    for(let i=0;i<samples.length;i++){const x=Math.max(-1,Math.min(1,samples[i]));view.setInt16(44+i*2,Math.round(x*(x<0?32768:32767)),true);}
    return buffer;
}
export async function prepareAudio(blob){
    const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
    const Offline=globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext;
    if(!Context||!Offline)throw Error('Decodificación no disponible');
    const ctx=new Context();
    try{
        const decoded=await ctx.decodeAudioData(await blob.arrayBuffer());
        // Limit memory and avoid processing recordings over five minutes.
        if(decoded.duration>300)throw Error('Audio superior a cinco minutos');
        const offline=new Offline(1,Math.max(1,Math.ceil(decoded.duration*16000)),16000);
        const source=offline.createBufferSource();source.buffer=decoded;source.connect(offline.destination);source.start();
        const rendered=await offline.startRendering(), samples=rendered.getChannelData(0);
        return {blob:new Blob([encodeWav(samples)],{type:'audio/wav'}),stats:analyzeSamples(samples,16000)};
    }finally{await ctx.close().catch(()=>{});}
}

// Shared MIME allowlist: do not rename unknown bytes as WebM.
const formats = Object.freeze({
    'audio/webm':'webm','video/webm':'webm','audio/mp4':'m4a','video/mp4':'mp4',
    'audio/x-m4a':'m4a','audio/m4a':'m4a','audio/mpeg':'mp3','audio/mp3':'mp3',
    'audio/mpga':'mpga','audio/wav':'wav','audio/wave':'wav','audio/x-wav':'wav',
    'audio/ogg':'ogg','application/ogg':'ogg','audio/flac':'flac','audio/x-flac':'flac',
    'audio/aac':'m4a','audio/x-aac':'m4a'
});
const extensions = Object.freeze({webm:'audio/webm',mp4:'video/mp4',m4a:'audio/mp4',mp3:'audio/mpeg',mpeg:'audio/mpeg',mpga:'audio/mpga',wav:'audio/wav',ogg:'audio/ogg',oga:'audio/ogg',opus:'audio/ogg',flac:'audio/flac',aac:'audio/aac'});
export function audioMime(type='', name=''){
    const mime=String(type).split(';')[0].trim().toLowerCase();
    if(Object.prototype.hasOwnProperty.call(formats,mime))return mime;
    if(mime && mime!=='application/octet-stream')return '';
    const ext=String(name).toLowerCase().split('.').pop();
    return Object.prototype.hasOwnProperty.call(extensions,ext)?extensions[ext]:'';
}
export function audioExtension(type){const mime=audioMime(type);return ['audio/aac','audio/x-aac'].includes(mime)?'':formats[mime]||'';}
export function sniffAudio(bytes){
    const b=bytes, at=(pos,s)=>Array.from(s).every((ch,i)=>b[pos+i]===ch.charCodeAt(0));
    if(at(0,'RIFF')&&at(8,'WAVE'))return 'audio/wav';
    if(at(4,'ftyp'))return 'audio/mp4';
    if(at(0,'OggS'))return 'audio/ogg';
    if(at(0,'fLaC'))return 'audio/flac';
    if(b[0]===0x1a&&b[1]===0x45&&b[2]===0xdf&&b[3]===0xa3)return 'audio/webm';
    if(at(0,'ID3')||(b[0]===0xff&&(b[1]&0xe0)===0xe0&&(b[1]&0x06)!==0))return 'audio/mpeg';
    return '';
}
export function recorderFormats(Recorder){
    if(!Recorder)return [];
    const candidates=['audio/webm;codecs=opus','audio/mp4;codecs=mp4a.40.2','audio/mp4','audio/ogg;codecs=opus','audio/webm','audio/ogg'];
    return [...candidates.filter(type=>{try{return typeof Recorder.isTypeSupported==='function'&&Recorder.isTypeSupported(type);}catch{return false;}}),null];
}
export async function fetchWithTimeout(url,options={},ms=90000){
    const controller=typeof AbortController==='function'?new AbortController():null;
    let timer;
    try{
        const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller?.abort();reject(Error('Tiempo de espera agotado.'));},ms);});
        return await Promise.race([fetch(url,{...options,...(controller?{signal:controller.signal}:{})}),timeout]);
    }finally{clearTimeout(timer);}
}
