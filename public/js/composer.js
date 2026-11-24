// Ajuste automático para navegadores sin soporte nativo de field-sizing.
const input = document.getElementById('consulta');

if (input && !CSS.supports('field-sizing', 'content')) {
    function resizeInput() {
        // Restablecer primero permite que el campo se reduzca al borrar texto.
        input.style.height = 'auto';
        input.style.height = input.scrollHeight + 'px';
        // CSS limita la altura; el texto adicional se desplaza dentro del campo.
    }

    input.addEventListener('input', resizeInput);
    window.addEventListener('resize', resizeInput);
    window.addEventListener('pageshow', resizeInput);
    resizeInput();
}
