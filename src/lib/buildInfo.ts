/**
 * Marcador de bundle — sirve para saber a simple vista (en los logs de Metro)
 * qué código está corriendo realmente en el teléfono.
 *
 * Síntoma que motivó esto: la app mostraba UI de `master` (botón rojo
 * "End session") mientras el working tree ya tenía la UI nueva. Sin un
 * marcador es imposible distinguir "el fix no funciona" de "el fix no llegó".
 */
export const BUILD_TAG = 'ui-ux-iteration';
