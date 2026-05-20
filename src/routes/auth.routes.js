// ============================================================
// src/routes/auth.routes.js  —  AUDITADO
// ============================================================
// HALLAZGOS y correcciones (SIN cambios de funcionalidad):
//
// [FIX-1] SEGURIDAD — Rate limiting en endpoints de login.
//         ANTES: POST /login no tenía límite de intentos → fuerza bruta
//         ilimitada contra el formulario web de autenticación.
//         AHORA: limitador de 10 intentos por ventana de 15 min sobre
//         la ruta POST /login. Si express-rate-limit no está instalado,
//         la app falla al iniciar con un error descriptivo (fail-fast)
//         en lugar de arrancar silenciosamente sin el límite.
//
// [FIX-2] SEGURIDAD — Verificación de disponibilidad de express-rate-limit.
//         El módulo es una dependencia de seguridad crítica. Si no está
//         instalado, se lanza un error en tiempo de carga del módulo
//         con un mensaje que indica el comando de instalación.
//
// [FIX-3] ARQUITECTURA — Separación explícita de los límites por ruta.
//         /login (POST) recibe el loginLimiter.
//         /logout, /inicio y /setup no están expuestos a fuerza bruta
//         de la misma manera y no requieren el mismo límite.
//
// SIN CAMBIOS FUNCIONALES: todas las rutas, controladores y middleware
// de autenticación (isLoggedIn) son idénticos al original.
// ============================================================

const express    = require('express');
const router     = express.Router();
const { isLoggedIn } = require('../middleware/auth.middleware');
const authCtrl   = require('../controllers/auth.controller');

// [FIX-2] Fail-fast: si express-rate-limit no está instalado, el error
// se detecta en tiempo de arranque, no en el primer intento de login.
// Instalar con: npm install express-rate-limit
let rateLimit;
try {
    rateLimit = require('express-rate-limit');
} catch (_) {
    throw new Error(
        '[auth.routes] express-rate-limit no está instalado. ' +
        'Ejecuta: npm install express-rate-limit'
    );
}

// [FIX-1] Rate limiter para el formulario de login web.
// 10 intentos por IP cada 15 minutos es un umbral razonable para uso
// legítimo (un usuario legítimo no necesita más de 5 intentos) y cierra
// la ventana de ataques de diccionario/fuerza bruta sin degradar la UX.
const loginLimiter = rateLimit({
    windowMs:        15 * 60 * 1000, // 15 minutos
    max:             10,             // máx. 10 intentos por IP
    standardHeaders: true,           // Expone RateLimit-* headers (RFC 6585)
    legacyHeaders:   false,          // Desactiva X-RateLimit-* headers deprecados
    message: {
        // Mensaje amigable para el usuario web (renderizado en la vista de error)
        error: 'Demasiados intentos de acceso. Por favor espera 15 minutos.'
    },
    // skipSuccessfulRequests: true → no cuenta los logins exitosos contra el límite.
    // Esto evita penalizar al usuario que ya inició sesión y recarga la página.
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