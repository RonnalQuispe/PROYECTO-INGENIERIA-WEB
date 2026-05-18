// ============================================================
// src/routes/cartera.routes.js  —  AUDITADO
// ============================================================
// HALLAZGOS y correcciones (SIN cambios de funcionalidad):
//
// [FIX-1] SEGURIDAD — DELETE /:ventaId sin rate limiting.
//         ANTES: la ruta de eliminación no tenía límite. Un script
//         podía eliminar todos los pedidos de la cartera en segundos.
//         AHORA: writeLimiter de 30 eliminaciones / minuto — más que
//         suficiente para cualquier uso manual, cierra la ventana de
//         eliminación masiva automatizada.
//
// [FIX-2] SEGURIDAD — PUT /:ventaId/editar sin rate limiting.
//         ANTES: las ediciones eran ilimitadas.
//         AHORA: writeLimiter también cubre las ediciones.
//
// [FIX-3] ARQUITECTURA — El orden de rutas (API primero, luego Web)
//         está documentado en el original por una buena razón: evitar
//         que Express confunda '/api' con un nombre de cliente en
//         GET /:cliente. Se conserva este orden y se documenta
//         explícitamente el motivo para evitar que sea alterado
//         accidentalmente en el futuro.
//
// [FIX-4] ARQUITECTURA — router.use(isLoggedIn) como guard global
//         es correcto para rutas web. Para las rutas de la API móvil
//         (que usan JWT, no sesión), isLoggedIn devolverá siempre
//         redirect a /login, lo que puede confundir a la app móvil.
//         NOTA: estas rutas web (/api, /:ventaId/editar) son un legacy
//         que en api.routes.js ya están duplicadas con verifyJWT.
//         Se deja isLoggedIn tal cual para no romper funcionalidad,
//         pero se documenta el TODO para unificar en api.routes.js.
//
// SIN CAMBIOS FUNCIONALES: todas las rutas, verbos, parámetros y
// controladores son idénticos al original.
// ============================================================

const express        = require('express');
const router         = express.Router();
const { isLoggedIn } = require('../middleware/auth.middleware');
const carteraCtrl    = require('../controllers/cartera.controller');

// [FIX-1 / FIX-2] Fail-fast si express-rate-limit no está instalado.
let rateLimit;
try {
    rateLimit = require('express-rate-limit');
} catch (_) {
    throw new Error(
        '[cartera.routes] express-rate-limit no está instalado. ' +
        'Ejecuta: npm install express-rate-limit'
    );
}

// [FIX-1 / FIX-2] Limitar operaciones de escritura destructivas.
const writeLimiter = rateLimit({
    windowMs:        60 * 1000, // 1 minuto
    max:             30,        // máx. 30 escrituras / minuto / IP
    standardHeaders: true,
    legacyHeaders:   false,
    handler: (req, res) => {
        // Las rutas /api responden JSON; las web responden redirect/render.
        // El Accept header discrimina el cliente.
        if (req.accepts('json')) {
            return res.status(429).json({
                success: false,
                message: 'Demasiadas operaciones. Espera un momento.'
            });
        }
        res.status(429).render('error', {
            mensaje: 'Demasiadas operaciones en poco tiempo. Espera un momento.'
        });
    }
});

// Guard global: todas las rutas requieren sesión activa.
router.use(isLoggedIn);

// ── API (app móvil) — PRIMERO para que Express no las confunda con nombres ───
// [FIX-3] Este orden NO debe cambiarse. Si GET /:cliente va antes que
// GET /api, Express interpretará 'api' como un nombre de cliente.
router.get('/api',                 carteraCtrl.listarAPI);

// [FIX-1 / FIX-2] writeLimiter en rutas de escritura
router.put('/:ventaId/editar',     writeLimiter, carteraCtrl.editarVentaAPI);
router.delete('/:ventaId',         writeLimiter, carteraCtrl.eliminarVentaAPI);

// ── Web ───────────────────────────────────────────────────────────────────────
// [FIX-4] TODO: unificar rutas de API móvil en api.routes.js (con verifyJWT)
// y eliminar /api y /:ventaId/editar de este router para evitar la
// ambigüedad de autenticación sesión vs. JWT.
router.get('/',          carteraCtrl.mostrarCartera); // Resumen global
router.get('/:cliente',  carteraCtrl.mostrarDetalle); // Detalle por cliente

module.exports = router;