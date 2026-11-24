// Reglas compartidas entre el navegador y el servidor. Sin dependencias.
export const POLICY_VERSION = '2026-11-24-v1';
export const DISCLOSURE = 'Soy una IA, puedo cometer errores. No sustituyo el criterio de un profesional.';
export const NO_INFORMATION = 'No tengo esa información. No dispongo de fuentes suficientes para responder con seguridad.';
export function redactPersonalData(text) {
    return String(text ?? '')
        .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gu, '[correo]')
        .replace(/(?<!\d)(?:\+?57[ .-]?)?3\d{2}[ .-]?\d{3}[ .-]?\d{4}(?!\d)/g, '[celular]')
        .replace(/\b\d{6,10}\b/g, '[documento]');
}
const normalized = text => String(text ?? '').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
const impact = {
    salud: ['dolor','medicamento','sintoma','diagnost','tratamiento','dosis','enfermedad','fiebre','salud','vacuna','embarazo','ansiedad','depresion','suicid','sangrado','respirar','cirugia','alergia'],
    educacion: ['nota','calificacion','expuls','sacar','permanencia','evaluacion','beca','admis'],
    publico: ['decision publica','subsidio','votacion','beneficio publico','servicio publico','dinero','prestamo','credito','empleo','despido']
};
const urgent = ['no puedo respirar','dificultad para respirar','dolor de pecho','dolor en el pecho','perdida de conocimiento','inconsciente','sangrado abundante','hemorragia','sobredosis','convulsion','suicid','matarme','quitarme la vida'];
export function detectHighImpact(question) {
    const q=normalized(question);
    return Object.entries(impact).filter(([,words])=>words.some(word=>q.includes(word))).map(([key])=>key);
}
export function detectEmergency(question) {
    const q=normalized(question);
    return urgent.some(word=>q.includes(word));
}
const source = (id,name,url,text) => Object.freeze({id,name,url,text});
const catalog = Object.freeze({
    emergency: source('emergency','MedlinePlus — Reconocimiento de emergencias médicas','https://medlineplus.gov/spanish/ency/article/001927.htm','Ante signos de emergencia, busca atención inmediata y llama al número local de emergencias.'),
    medicine: source('medicine','MedlinePlus — Seguridad con los medicamentos','https://medlineplus.gov/spanish/ency/patientinstructions/000766.htm','Es importante verificar el medicamento, la dosis prescrita y el horario con el profesional que lo indica o dispensa.'),
    prevention: source('prevention','MedlinePlus — Atención preventiva de la salud','https://medlineplus.gov/spanish/ency/article/001921.htm','La atención preventiva incluye promover estilos de vida saludables y revisiones para detectar problemas de salud.'),
    vaccines: source('vaccines','MedlinePlus — Vacunación','https://medlineplus.gov/spanish/vaccines.html','Las vacunas ayudan a proteger contra determinadas enfermedades; consulta el esquema que corresponda con un profesional.'),
    lifestyle: source('lifestyle','MedlinePlus — Vida saludable','https://medlineplus.gov/spanish/ency/article/002393.htm','Los hábitos de vida saludables, incluida la actividad física, pueden favorecer la salud y la calidad de vida.'),
    nutrition: source('nutrition','MedlinePlus — Nutrición','https://medlineplus.gov/spanish/nutrition.html','Una alimentación saludable puede contribuir a reducir riesgos de algunas enfermedades crónicas.')
});
export function selectSources(question) {
    const q=normalized(question), out=[];
    if(detectEmergency(q))out.push(catalog.emergency);
    if(/medicament|farmac|dosis|pastill/.test(q))out.push(catalog.medicine);
    if(/prevencion|preventiv|control de salud/.test(q))out.push(catalog.prevention);
    if(/vacun/.test(q))out.push(catalog.vaccines);
    if(/habitos|actividad fisica|ejercicio|vida saludable|bienestar/.test(q))out.push(catalog.lifestyle);
    if(/nutricion|alimentacion|comer/.test(q))out.push(catalog.nutrition);
    return out;
}
export function sourceNotice(sources = []) {
    const names=sources.map(s=>typeof s==='string'?s:s.name);
    if(names.length===0)return 'Sin fuentes verificadas para esta consulta. No uses esta respuesta para tomar decisiones.';
    return 'Fuentes consultadas ('+names.length+'): '+names.join(', ')+'.';
}
// La aplicación es de salud: si no existe evidencia suficiente, no adivina.
// Las respuestas de esta fase se generan mediante reglas y extractos revisados,
// no por un modelo externo. Una lista de palabras no es un clasificador clínico.
export function localGuidance(question) {
    const domains=detectHighImpact(question);
    const sources=selectSources(question);
    const emergency=detectEmergency(question);
    const rule=emergency?'EMERGENCIA':domains.length?'ALTO_IMPACTO':'INFORMACION_GENERAL';
    let text;
    if(emergency)text='Si esto describe una situación actual, busca atención médica urgente o llama al número local de emergencias. No esperes una respuesta del chat.';
    else if(domains.includes('educacion')||domains.includes('publico'))text='No puedo decidir calificaciones, permanencia, beneficios, dinero u otras decisiones de alto impacto. Consulta a la persona o entidad responsable.';
    else if(sources.length)text=sources.map(s=>s.text).join('\n\n')+'\n\nEsta es información general, no una valoración individual. Consulta a un profesional de salud para decidir.';
    else text=NO_INFORMATION+' Consulta a un profesional de salud si necesitas una valoración individual.';
    // No presentar fuentes no utilizadas en una decisión fuera del ámbito.
    const used=!emergency&&(domains.includes('educacion')||domains.includes('publico'))?[]:sources;
    return {text,rule,domains,sources:used.map(({id,name,url})=>({id,name,url})),sourceNotice:sourceNotice(used),disclosure:'Orientación automática mediante reglas revisadas. '+DISCLOSURE,generatedBy:'rules',policyVersion:POLICY_VERSION};
}
export function validConsent(value, operation) {
    return !!value && value.version===POLICY_VERSION && value.operation===operation && value.accepted===true;
}
export function safeRevision(original, revised) {
    // Una comprobación conservadora de números/negaciones; no garantiza semántica.
    const tokens=s=>normalized(s).match(/\[correo\]|\[celular\]|\[documento\]|\d+(?:[.,]\d+)?|\b(?:no|sin|nunca|jamas|niega|ningun[oa]?)\b/g)||[];
    return JSON.stringify(tokens(original))===JSON.stringify(tokens(revised));
}
