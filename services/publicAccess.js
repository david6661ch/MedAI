import { createHash, timingSafeEqual } from 'node:crypto';

export const publicMode = (env=process.env) => env.MEDAI_PUBLIC_BACKEND === 'true';
export const accessConfigured = (env=process.env) => typeof env.MEDAI_DEMO_ACCESS_CODE === 'string' && env.MEDAI_DEMO_ACCESS_CODE.trim().length >= 32;
export function validAccess(header,env=process.env){
    if(!publicMode(env))return true;
    if(!accessConfigured(env)||typeof header!=='string'||header.length>512)return false;
    const digest=value=>createHash('sha256').update(value).digest();
    return timingSafeEqual(digest(header),digest('Bearer '+env.MEDAI_DEMO_ACCESS_CODE.trim()));
}
// Limites conservadores por instancia para una demostración, no contabilidad persistente.
let day='', count=0, active=0;
export function reserveDemoRequest(now=new Date()){
    const current=now.toISOString().slice(0,10);
    if(current!==day){day=current;count=0;}
    if(count>=60||active>=2)return null;
    count++;active++;
    let released=false;
    return ()=>{if(!released){released=true;active--;}};
}
