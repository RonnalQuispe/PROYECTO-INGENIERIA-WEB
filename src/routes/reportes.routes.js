// ============================================================
// src/routes/reportes.routes.js  —  AUDITADO
// ============================================================
// HALLAZGOS y correcciones (SIN cambios de funcionalidad):
//
// [FIX-1] SEGURIDAD — Sin rate limiting en el endpoint del dashboard.
//         ANTES: GET /reportes podía recibir peticiones ilimitadas.
//         El dashboard ejecuta 9 aggregations de MongoDB en paralelo
//         (ver reportes.service.js). Sin límite, un atacante o un bug
//         de polling en la app puede saturar la base de datos.
//         AHORA: reportesLimiter de 60 req / minuto. Este umbral es
//         muy permisivo para uso manual (1 req/segundo) y evita el
//         abuso de pipelines pesados.
//
// [FIX-2] SEGURIDAD — El dashboard incluye datos financieros completos
//         (ventas, ingresos, proyecciones). No se añade control de roles
//         porque el proyecto aún no implementa RBAC, pero se documenta
//         el TODO para que el equipo lo evalúe antes de añadir usuarios
//         con roles diferenciados (ej. "vendedor" vs "administrador").
//
// SIN CAMBIOS FUNCIONALES: la ruta, el verbo, isLoggedIn y el
// controlador asociado son idénticos al original.
// ============================================================

const express            = require('express');
const router             = express.Router();
const { isLoggedIn }     = require('../middleware/auth.middleware');
const reportesController = require('../controllers/reportes.controller');

// [FIX-1] Fail-fast si express-rate-limit no está instalado.
let rateLimit;
try {
    rateLimit = require('express-rate-limit');
} catch (_) {
    throw new Error(
        '[reportes.routes] express-rate-limit no está instalado. ' +
        'Ejecuta: npm install express-rate-limit'
    );
}

// [FIX-1] Limitar las peticiones al dashboard para proteger los pipelines
// de aggregation de MongoDB ante polling excesivo o abusos.
const reportesLimiter = rateLimit({
    windowMs:        60 * 1000, // 1 minuto
    max:             60,        // 1 req/seg en promedio — permisivo para uso manual
    standardHeaders: true,
    legacyHeaders:   false,
    handler: (req, res) => {
        res.status(429).render('error', {
            mensaje: 'Demasiadas peticiones al dashboard. Espera un momento.'
        });
    }
});

// [FIX-2] TODO ARQUITECTÓNICO — Control de roles:
// Antes de añadir roles diferenciados al sistema, evaluar si el dashboard
// debe estar restringido a administradores únicamente:
//   router.get('/', isLoggedIn, requireRole('admin'), reportesLimiter, ...);
// Por ahora cualquier usuario a deutenticado puede acceder (comportamiento original).
router.get('/', isLoggedIn, reportesLimiter, reportesController.mostrarDashboard);

module.exports = router;