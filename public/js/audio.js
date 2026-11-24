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
