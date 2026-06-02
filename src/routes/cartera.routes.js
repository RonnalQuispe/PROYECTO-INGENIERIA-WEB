
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

// ── API (app móvil) — 
router.get('/api',                 carteraCtrl.listarAPI);

// [FIX-1 / FIX-2] writeLimiter en rutas de escritura
router.put('/:ventaId/editar',     writeLimiter, carteraCtrl.editarVentaAPI);
router.delete('/:ventaId',         writeLimiter, carteraCtrl.eliminarVentaAPI);

// ── Web ───────────────────────────────────────────────────────────────────────
router.get('/',          carteraCtrl.mostrarCartera); // Resumen global
router.get('/:cliente',  carteraCtrl.mostrarDetalle); // Detalle por cliente

module.exports = router;