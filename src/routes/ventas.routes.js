// ============================================================
// src/routes/ventas.routes.js  —  AUDITADO
// ============================================================
// HALLAZGOS y correcciones (SIN cambios de funcionalidad):
//
// [FIX-1] SEGURIDAD — GET /eliminar/:id para una operación destructiva.
//         ANTES: la eliminación se disparaba con un GET (enlace en la UI).
//         Un GET puede ser ejecutado por prefetch del navegador, crawlers,
//         o simplemente con una URL copiada → eliminación accidental o CSRF
//         sin necesidad de un exploit sofisticado.
//         AHORA: la ruta se conserva exactamente como estaba (sin cambio
//         funcional) pero se documenta el riesgo con un comentario de
//         TODO arquitectónico para migrar a DELETE + confirmación.
//         No se cambia el verbo porque hacerlo requeriría cambios en la
//         vista HTML (fuera del alcance de este archivo).
//
// [FIX-2] SEGURIDAD — POST /editar/:id sin validación de método alternativa.
//         Express ya gestiona esto correctamente, no hay riesgo adicional.
//         Se documenta como "revisado y correcto".
//
// [FIX-3] SEGURIDAD — Sin rate limiting en rutas de escritura web.
//         ANTES: POST /guardar y POST /cobrar/:id podían recibir peticiones
//         ilimitadas (spam de ventas o cobros desde un script).
//         AHORA: writeLimiter de 60 escrituras / minuto por IP, que es
//         suficiente para cualquier uso manual legítimo y bloquea scripts.
//
// [FIX-4] ARQUITECTURA — router.use(isLoggedIn) como middleware global del
//         router es correcto y no requiere cambios. Se conserva.
//
// SIN CAMBIOS FUNCIONALES: todas las rutas, verbos y controladores
// son idénticos al original. Solo se añade rate limiting.
// ============================================================

const express    = require('express');
const router     = express.Router();
const { isLoggedIn } = require('../middleware/auth.middleware');
const ventasCtrl = require('../controllers/ventas.controller');

// [FIX-3] Fail-fast si express-rate-limit no está instalado.
let rateLimit;
try {
    rateLimit = require('express-rate-limit');
} catch (_) {
    throw new Error(
        '[ventas.routes] express-rate-limit no está instalado. ' +
        'Ejecuta: npm install express-rate-limit'
    );
}

// [FIX-3] Limitar operaciones de escritura desde la interfaz web.
// 60 escrituras / minuto es más que suficiente para uso manual intensivo
// y elimina la posibilidad de spam automatizado desde el navegador.
const writeLimiter = rateLimit({
    windowMs:        60 * 1000, // 1 minuto
    max:             60,
    standardHeaders: true,
    legacyHeaders:   false,
    // En rutas web, redirigir a la lista con mensaje de error
    // en lugar de responder JSON (el usuario está en un navegador).
    handler: (req, res) => {
        res.status(429).render('error', {
            mensaje: 'Demasiadas operaciones en poco tiempo. Espera un momento.'
        });
    }
});

// [FIX-4] Protección global del router: todas las rutas requieren sesión.
router.use(isLoggedIn);

// ── Rutas de solo lectura (sin límite adicional) ───────────────────────────────
router.get('/',                ventasCtrl.listar);         // Listar + filtros
router.get('/crear',           ventasCtrl.mostrarCrear);   // Formulario crear
router.get('/detalle/:id',     ventasCtrl.mostrarDetalle); // Ver detalle
router.get('/editar/:id',      ventasCtrl.mostrarEditar);  // Formulario editar

// ── Rutas de escritura (con writeLimiter) ─────────────────────────────────────
router.post('/guardar',        writeLimiter, ventasCtrl.guardar);         // Guardar nueva venta
router.post('/editar/:id',     writeLimiter, ventasCtrl.actualizar);      // Actualizar venta
router.post('/cobrar/:id',     writeLimiter, ventasCtrl.registrarCobro);  // Registrar cobro

// [FIX-1] TODO ARQUITECTÓNICO: Esta ruta usa GET para una acción destructiva.
// Riesgo: puede ser ejecutada accidentalmente por prefetch del navegador o
// con solo compartir la URL. Migrar a:
//   router.delete('/eliminar/:id', writeLimiter, ventasCtrl.eliminar);
// y actualizar la vista HTML para usar un formulario POST con method-override,
// o una petición fetch() DELETE con confirmación en JS.
// Por ahora se conserva el comportamiento original SIN CAMBIO FUNCIONAL.
router.get('/eliminar/:id',    ventasCtrl.eliminar);

module.exports = router;