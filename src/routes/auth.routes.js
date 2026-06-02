

const express    = require('express');
const router     = express.Router();
const { isLoggedIn } = require('../middleware/auth.middleware');
const authCtrl   = require('../controllers/auth.controller');


let rateLimit;
try {
    rateLimit = require('express-rate-limit');
} catch (_) {
    throw new Error(
        '[auth.routes] express-rate-limit no está instalado. ' +
        'Ejecuta: npm install express-rate-limit'
    );
}


const loginLimiter = rateLimit({
    windowMs:        15 * 60 * 1000, // 15 minutos
    max:             10,             // máx. 10 intentos por IP
    standardHeaders: true,           // Expone RateLimit-* headers (RFC 6585)
    legacyHeaders:   false,          // Desactiva X-RateLimit-* headers deprecados
    message: {
         error: 'Demasiados intentos de acceso. Por favor espera 15 minutos.'
    },
    skipSuccessfulRequests: true,
});

// ── Rutas ─────────────────────────────────────────────────────────────────────

router.get('/',      (req, res) => res.redirect('/login'));
router.get('/login', authCtrl.mostrarLogin);

// [FIX-1] loginLimiter aplicado SOLO al POST para no penalizar la vista GET
router.post('/login',  loginLimiter, authCtrl.procesarLogin);

router.get('/logout', authCtrl.logout);
router.get('/inicio', isLoggedIn, authCtrl.mostrarInicio);

// [FIX] /setup solo existe en desarrollo. En producción esta ruta no se
// registra — no es descubrible por scanners ni responde nada.
if (process.env.NODE_ENV === 'development') {
    router.get('/setup', authCtrl.crearUsuario);
}

module.exports = router;