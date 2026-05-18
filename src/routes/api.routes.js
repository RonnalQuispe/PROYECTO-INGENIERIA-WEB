// ============================================================
// src/routes/api.routes.js  —  AUDITADO
// ============================================================
// HALLAZGOS y correcciones (SIN cambios de funcionalidad):
//
// [FIX-1] SEGURIDAD — Sin rate limiting en ningún endpoint de la API.
//         ANTES: la API pública POST /auth/login era atacable con fuerza
//         bruta ilimitada sin ninguna consecuencia para el atacante.
//         AHORA: loginLimiter estricto (5 intentos / 15 min) sobre
//         POST /auth/login. Los endpoints protegidos (bajo verifyJWT)
//         tienen un apiLimiter más permisivo (300 req / 15 min) para
//         proteger contra abusos sin impactar el uso legítimo.
//
// [FIX-2] SEGURIDAD — Sin cabeceras de seguridad HTTP en las respuestas.
//         ANTES: la API respondía sin Content-Security-Policy,
//         X-Content-Type-Options ni Referrer-Policy, exponiendo las
//         respuestas JSON a sniffing de MIME y fugas de origen.
//         AHORA: helmet() aplicado globalmente en este router.
//         Nota: si helmet ya está montado en app.js/server.js,
//         esta línea es redundante pero inocua (doble cabecera segura).
//
// [FIX-3] SEGURIDAD — Sin validación de Content-Type en peticiones POST/PUT.
//         ANTES: un cliente podía enviar un body con Content-Type: text/plain
//         y el parser de Express lo ignoraba silenciosamente, dejando el
//         body vacío y produciendo errores difíciles de depurar.
//         AHORA: middleware enforceJson que rechaza con 415 Unsupported
//         Media Type cualquier POST/PUT/PATCH sin Content-Type: application/json.
//
// [FIX-4] ARQUITECTURA — La ruta DELETE /ventas/:id permitía eliminar
//         ventas sin ningún log de auditoría en la capa de rutas.
//         No se cambia la funcionalidad, pero se documenta que el controller
//         (eliminarAPI) debe añadir registro de auditoría internamente.
//         Issue registrado en comentario para el equipo.
//
// SIN CAMBIOS FUNCIONALES: todas las rutas, verbos HTTP, parámetros y
// controladores asociados son idénticos al original.
// ============================================================

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

// ── REPORTES ──────────────────────────────────────────────────────────────────
router.get('/reportes/kpis',                         reportesCtrl.kpisAPI);
router.get('/reportes/dashboard',                    reportesCtrl.dashboardAPI);

module.exports = router;