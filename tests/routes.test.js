import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { server } from '../server.js';

let base;
before(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => server.close(resolve)));

const paths = ['/', '/sintomas', '/bienestar', '/medicamentos', '/prevencion', '/habitos', '/historial', '/favoritos', '/configuracion', '/ayuda', '/soporte', '/educacion', '/orientacion'];
for (const path of paths) {
    test(`GET ${path}`, async () => {
        const response = await fetch(base + path);
        assert.equal(response.status, 200);
        const html = await response.text();
        assert.match(html, /<html lang="es"/);
        assert.match(html, /<h1[ >]/);
        assert.match(html, /<\/html>/);
        assert.doesNotMatch(html, /\{\{\w+\}\}/);
        assert.match(html, /Soy una IA, puedo cometer errores/);
        assert.match(html, /No sustituye el diagnóstico/);
        assert.match(html, /href="\/soporte"/);
        if (!['/educacion', '/orientacion'].includes(path)) {
            assert.match(html, /aria-current="page"/);
        }
    });
}
test('CSS y logo disponibles', async () => {
    for (const path of ['/css/styles.css', '/css/output.css', '/css/vendor/bootstrap.min.css', '/img/logo.svg', '/js/composer.js']) {
        assert.equal((await fetch(base + path)).status, 200);
    }
});
test('404 y archivos privados', async () => {
    for (const path of ['/no-existe', '/server.js', '/models/pageModel.js']) {
        const response = await fetch(base + path);
        assert.equal(response.status, 404);
        assert.match(await response.text(), /Página no encontrada/);
    }
});
test('POST no permitido y HEAD sin cuerpo', async () => {
    assert.equal((await fetch(base + '/', { method: 'POST' })).status, 405);
    assert.equal(await (await fetch(base + '/', { method: 'HEAD' })).text(), '');
});

test('Aviso compartido y acceso a soporte técnico', async () => {
    const chat = await (await fetch(base + '/')).text();
    assert.equal((chat.match(/id="aviso-medico"/g) || []).length, 1);
    assert.match(chat, /aria-describedby="aviso-medico"/);
    const help = await (await fetch(base + '/ayuda')).text();
    assert.match(help, /href="\/soporte">Contactar con soporte técnico/);
    const support = await (await fetch(base + '/soporte')).text();
    assert.match(support, /<h1>Soporte técnico<\/h1>/);
    assert.match(support, /<fieldset disabled>/);
    assert.match(support, /Enviar solicitud · Próximamente/);
});

test('Advertencia destacada y respuesta futura de respaldo', async () => {
    const chat = await (await fetch(base + '/')).text();
    assert.ok(chat.indexOf('id="aviso-medico"') < chat.indexOf('id="consulta"'));
    assert.match(chat, /class="medical-notice-description"/);
    assert.match(chat, /<template id="respuesta-sin-informacion">/);
    assert.match(chat, /No tengo esa información/);
});

test('Campo de consulta adaptable y recurso JavaScript', async () => {
    const html = await (await fetch(base + '/')).text();
    assert.match(html, /<script src="\/js\/composer\.js" defer><\/script>/);
    const css = await (await fetch(base + '/css/styles.css')).text();
    assert.match(css, /\.composer-area\s*\{\s*position: sticky;\s*bottom: 0;/);
    assert.match(css, /field-sizing: content/);
    const script = await fetch(base + '/js/composer.js');
    assert.equal(script.status, 200);
    assert.match(script.headers.get('content-type'), /text\/javascript/);
    assert.match(await script.text(), /scrollHeight/);
});
