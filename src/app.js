// ============================================================
// src/app.js  —  AUDITADO
// ============================================================
// [FIX-1] SESSION_SECRET sin fallback inseguro.
//         ANTES: || '' permitía arrancar con sesión sin firmar → cualquiera
//         podía forjar cookies. Ahora: fail-fast si no está definida.
//
// [FIX-2] Validación de variables de entorno críticas al arranque.
//         Si MONGODB_URI o SESSION_SECRET faltan, el error se detecta
//         inmediatamente con un mensaje claro, no en mitad de una request.
//
// [FIX-3] Opciones de seguridad en la cookie de sesión.
//         ANTES: sin httpOnly ni sameSite → vulnerable a XSS y CSRF.
//         AHORA: httpOnly: true, sameSite: 'strict', secure en producción.
//
// [FIX-4] Helmet aplicado globalmente en app.js.
//         Cubre todas las rutas (web + API) con cabeceras de seguridad HTTP.
//
// SIN CAMBIOS FUNCIONALES: mismas rutas, mismo puerto, misma lógica.
// ============================================================

const express    = require('express');
const path       = require('path');
const session    = require('express-session');
const MongoStore = require('connect-mongo');
const helmet     = require('helmet');
require('dotenv').config();

// [FIX-2] Validación temprana de variables de entorno críticas.
// La app no debe arrancar si faltan — un error claro aquí es mejor
// que un crash críptico o una vulnerabilidad silenciosa más adelante.
const REQUIRED_ENV = ['SESSION_SECRET', 'MONGODB_URI', 'JWT_SECRET'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length > 0) {
    console.error(`❌ Variables de entorno faltantes: ${missing.join(', ')}`);
    console.error('   Defínelas en tu archivo .env o en el panel de Render.');
    process.exit(1);
}

const connectDB = require('./database/db');
const app = express();

connectDB();

// [FIX-4] Helmet: cabeceras de seguridad HTTP para todas las rutas.
// Incluye: X-Content-Type-Options, X-Frame-Options, Referrer-Policy,
// Strict-Transport-Security (HSTS), y otras ~10 cabeceras protectoras.
// Se configura con CSP desactivado para no romper las vistas EJS existentes
// (EJS usa scripts inline). Activar CSP en una iteración futura con nonces.
app.use(helmet({
    contentSecurityPolicy: false, // TODO: activar con nonces cuando las vistas lo soporten
}));

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, '../public')));

// [FIX-1 / FIX-3] Sesión segura.
//   - secret: sin fallback — falla al arrancar si no está definida (FIX-1/FIX-2).
//   - httpOnly: true → la cookie no es accesible desde JavaScript del navegador
//     (mitiga robo de sesión por XSS).
//   - sameSite: 'strict' → la cookie no se envía en requests cross-site
//     (mitiga CSRF sin necesidad de tokens adicionales para rutas web simples).
//   - secure: true solo en producción → en desarrollo funciona sin HTTPS.
app.use(session({
    secret:            process.env.SESSION_SECRET,
    resave:            false,
    saveUninitialized: false,
    store:             MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
    cookie: {
        maxAge:   1000 * 60 * 60 * 8, // 8 horas (sin cambio)
        httpOnly: true,                // [FIX-3] Bloquea acceso desde JS del navegador
        sameSite: 'strict',            // [FIX-3] Previene CSRF básico
        secure:   process.env.NODE_ENV === 'production' // [FIX-3] HTTPS solo en prod
    }
}));

// ── Rutas ─────────────────────────────────────────────────────────────────────
app.use('/',         require('./routes/auth.routes'));
app.use('/ventas',   require('./routes/ventas.routes'));
app.use('/reportes', require('./routes/reportes.routes'));
app.use('/cartera',  require('./routes/cartera.routes'));
app.use('/api/v1',   require('./routes/api.routes'));

// ── Arranque ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor corriendo en el puerto ${PORT}`);
});