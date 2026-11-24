import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redactPersonalData, detectHighImpact, localGuidance, sourceNotice, safeRevision, validConsent, POLICY_VERSION } from '../public/js/ethics.js';
test('Ocultar correo',()=>assert.equal(redactPersonalData('Escribe a prueba+uno@example.com'),'Escribe a [correo]'));
test('Ocultar celular colombiano antes del documento',()=>assert.equal(redactPersonalData('3101234567 +57 310 123 4567'),'[celular] [celular]'));
test('Documento y correo en el mismo texto',()=>assert.equal(redactPersonalData('CC 12345678, correo a@b.co'),'CC [documento], correo [correo]'));
test('No modificar números cortos',()=>assert.equal(redactPersonalData('Tengo 20 años y tomo 2 vasos de agua'),'Tengo 20 años y tomo 2 vasos de agua'));
test('Redacción idempotente',()=>{const a=redactPersonalData('3101234567 test@example.com 123456');assert.equal(redactPersonalData(a),a)});
test('Detectar alto impacto y acentos',()=>{assert.ok(detectHighImpact('Tengo DÓLOR').includes('salud'));assert.ok(detectHighImpact('Mis notas').includes('educacion'));assert.ok(detectHighImpact('Necesito dinero').includes('publico'))});
test('El aviso cuenta y nombra fuentes',()=>assert.equal(sourceNotice(['A','B']),'Fuentes consultadas (2): A, B.'));
test('Sin fuentes, advertencia explícita',()=>assert.match(sourceNotice([]),/Sin fuentes/));
test('Control humano y urgencias',()=>{assert.equal(localGuidance('No puedo respirar').rule,'EMERGENCIA');assert.match(localGuidance('Decide mis notas').text,/persona o entidad responsable/);assert.match(localGuidance('¿Qué enfermedad tengo?').text,/No tengo esa información/);});
test('Fuentes acotadas al tema y no inventadas',()=>{const r=localGuidance('Información de vacunas');assert.equal(r.sources.length,1);assert.equal(r.sources[0].id,'vaccines');assert.match(r.sourceNotice,/1/);});
for(const [field,a,b] of [['género','mujer','hombre'],['edad','20 años','60 años'],['ciudad','Bello','Bogotá']]){
    test('Equidad de enrutamiento: '+field,()=>{
        const p=field==='edad'?'Tengo ':field==='ciudad'?'Vivo en ':'Soy ';
        const x=localGuidance(p+a+'. ¿Puedes decidir mis notas?'),y=localGuidance(p+b+'. ¿Puedes decidir mis notas?');
        assert.deepEqual(x,y);
        const h=localGuidance(p+a+'. Tengo dolor, ¿qué enfermedad tengo?'),j=localGuidance(p+b+'. Tengo dolor, ¿qué enfermedad tengo?');
        assert.deepEqual(h,j);
    });
}
test('Consentimiento específico y vigente',()=>{assert.equal(validConsent({version:POLICY_VERSION,operation:'chat',accepted:true},'chat'),true);assert.equal(validConsent({version:POLICY_VERSION,operation:'audio',accepted:true},'chat'),false);assert.equal(validConsent(null,'chat'),false);});
test('La revisión rechaza cambios detectables de números y negaciones',()=>{assert.equal(safeRevision('No tomé 2 mg','Tomé 20 mg'),false);assert.equal(safeRevision('no tome 2 mg','No tomé 2 mg.'),true);});
