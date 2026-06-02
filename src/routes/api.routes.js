

const express    = require('express');
const router     = express.Router();
const { verifyJWT } = require('../middleware/auth.middleware');

const authCtrl      = require('../controllers/auth.controller');
const ventasCtrl    = require('../controllers/ventas.controller');
const carteraCtrl   = require('../controllers/cartera.controller');
const reportesCtrl  = require('../controllers/reportes.controller');
const clientesCtrl  = require('../controllers/clientes.controller');

// ── Dependencias de seguridad ─────────────────────────────────────────────────
// [FIX-1] Fail-fast: errores en tiempo de carga, no en tiempo de ejecución.
let rateLimit, helmet;
try {
    rateLimit = require('express-rate-limit');
} catch (_) {
    throw new Error(
        '[api.routes] express-rate-limit no está instalado. ' +
        'Ejecuta: npm install express-rate-limit'
    );
}
try {
    helmet = require('helmet');
} catch (_) {
    throw new Error(
        '[api.routes] helmet no está instalado. ' +
        'Ejecuta: npm install helmet'
    );
}

// ── Limitadores ───────────────────────────────────────────────────────────────

// [FIX-1] Límite estricto para login: 5 intentos / 15 min / IP.
// Cierra la ventana de ataques de diccionario contra la API móvil.
const loginLimiter = rateLimit({
    windowMs:        15 * 60 * 1000,
    max:             5,
    standardHeaders: true,
    legacyHeaders:   false,
    skipSuccessfulRequests: true,
    message: {
        success: false,
        message: 'Demasiados intentos de acceso. Espera 15 minutos.'
    }
});

// [FIX-1] Límite general para todos los endpoints protegidos.
// 300 req / 15 min es permisivo para uso normal de app móvil y cierra
// abusos de scraping o DoS de baja intensidad.
const apiLimiter = rateLimit({
    windowMs:        15 * 60 * 1000,
    max:             300,
    standardHeaders: true,
    legacyHeaders:   false,
    message: {
        success: false,
        message: 'Demasiadas peticiones. Intenta de nuevo en unos minutos.'
    }
});

// ── Middleware de seguridad global del router ─────────────────────────────────

// [FIX-2] helmet agrega ~14 cabeceras de seguridad HTTP en todas las respuestas
// de este router: X-Content-Type-Options, Referrer-Policy, etc.
router.use(helmet());

// [FIX-3] Rechaza peticiones de escritura (POST/PUT/PATCH) sin JSON body.
// Evita errores silenciosos cuando el cliente olvida el Content-Type.
const enforceJson = (req, res, next) => {
    const methodsWithBody = ['POST', 'PUT', 'PATCH'];
    if (methodsWithBody.includes(req.method)) {
        const contentType = req.headers['content-type'] || '';
        if (!contentType.includes('application/json')) {
            return res.status(415).json({
                success: false,
                message: 'Content-Type debe ser application/json.'
            });
        }
    }
    next();
};
router.use(enforceJson);

// ── AUTH — pública ────────────────────────────────────────────────────────────
// [FIX-1] loginLimiter aplicado antes del controller
router.post('/auth/login', loginLimiter, authCtrl.loginAPI);

// ── PROTECCIÓN GLOBAL + RATE LIMIT GENERAL ───────────────────────────────────
// Todos los endpoints a partir de aquí requieren JWT válido
// y están sujetos al límite de 300 req / 15 min.
router.use(verifyJWT);
router.use(apiLimiter);

// ── CLIENTES ──────────────────────────────────────────────────────────────────
router.get('/clientes',                              clientesCtrl.buscarClientes);
router.post('/clientes',                             clientesCtrl.crearCliente);
router.put('/clientes/:id',                          clientesCtrl.actualizarCliente);

// ── ENTIDADES ─────────────────────────────────────────────────────────────────
router.get('/entidades',                             clientesCtrl.buscarEntidades);
router.post('/entidades',                            clientesCtrl.crearEntidad);

// ── VENTAS ────────────────────────────────────────────────────────────────────
// [FIX-4] TODO: eliminarAPI debe registrar auditoría internamente
//         (quién eliminó, cuándo, qué ventaId).
router.get('/ventas',                                ventasCtrl.listarAPI);
router.post('/ventas',                               ventasCtrl.guardarAPI);
router.put('/ventas/:id',                            ventasCtrl.actualizarAPI);
router.delete('/ventas/:id',                         ventasCtrl.eliminarAPI);
router.post('/ventas/:id/cobros',                    ventasCtrl.registrarCobroAPI);
router.patch('/ventas/:id/items/:itemId/entrega',    ventasCtrl.actualizarEntregaItemAPI);

// ── CARTERA ───────────────────────────────────────────────────────────────────
router.get('/cartera',                               carteraCtrl.listarAPI);
router.get('/cartera/:cliente',                      carteraCtrl.detalleAPI);
router.put('/cartera/:ventaId/editar',               carteraCtrl.editarVentaAPI);

/* ── REPORTES ──────────────────────────────────────────────────────────────────
router.get('/reportes/kpis',                         reportesCtrl.kpisAPI);
router.get('/reportes/dashboard',                    reportesCtrl.dashboardAPI);*/

module.exports = router;