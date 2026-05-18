// ============================================================
// src/controllers/auth.controller.js
// ============================================================
// Métodos WEB (sin cambios de comportamiento):
//   mostrarLogin, procesarLogin, logout, mostrarInicio, crearUsuario
//
// Método API NUEVO:
//   loginAPI  →  POST /api/v1/auth/login  →  responde JWT en JSON
//
// ── CORRECCIONES DE SEGURIDAD (sin cambios funcionales) ──────
// [FIX-1] crearUsuario: bloqueado en producción con guard NODE_ENV.
//         Antes: accesible en cualquier entorno → riesgo de creación
//         de admin con contraseña hardcodeada en producción.
//
// [FIX-2] loginAPI: neutralización de timing attack por enumeración
//         de usuarios. Antes: retorno inmediato si el usuario no
//         existía (sin pasar por bcrypt) → respuesta ~100ms más
//         rápida que un login fallido con usuario válido → atacante
//         podía distinguir "usuario inexistente" de "contraseña
//         incorrecta" midiendo el tiempo de respuesta.
//         Ahora: siempre ejecuta bcrypt.compare() con un hash dummy
//         cuando el usuario no existe → tiempo constante en ambas ramas.
//
// NOTA PARA EL ROUTER — Rate Limiting (no es un cambio del controller):
//   Agregar antes de montar las rutas de login:
//
//   const rateLimit = require('express-rate-limit');
//   const loginLimiter = rateLimit({
//       windowMs: 15 * 60 * 1000,
//       max: 10,
//       message: { success: false, message: 'Demasiados intentos. Espera 15 minutos.' },
//       standardHeaders: true,
//       legacyHeaders: false,
//   });
//   router.post('/login',              loginLimiter, authController.procesarLogin);
//   router.post('/api/v1/auth/login',  loginLimiter, authController.loginAPI);
// ============================================================

const bcrypt       = require('bcrypt');
const Usuario      = require('../models/usuario.model');
const { generarToken } = require('../middleware/auth.middleware');

// [FIX-2] Hash dummy para garantizar tiempo constante en loginAPI.
// El valor no necesita ser válido; solo debe tener el formato de bcrypt
// para que compare() tome el mismo tiempo que con un hash real.
const DUMMY_HASH = '$2b$12$invalidhashXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

// ── Mostrar página de login ──────────────────────────────────────────────────
exports.mostrarLogin = (req, res) => {
    if (req.session.usuarioId) return res.redirect('/inicio');
    res.render('index', { titulo: 'AdminExpress - Login', error: null });
};

// ── Procesar login (navegador) ───────────────────────────────────────────────
exports.procesarLogin = async (req, res) => {
    const { usuario, contrasena } = req.body;

    try {
        const usuarioEncontrado = await Usuario.findOne({ usuario });

        if (!usuarioEncontrado) {
            return res.render('index', {
                titulo: 'Login',
                error: 'Usuario o contraseña incorrectos'
            });
        }

        const esValida = await usuarioEncontrado.compararContrasena(contrasena);

        if (!esValida) {
            return res.render('index', {
                titulo: 'Login',
                error: 'Usuario o contraseña incorrectos'
            });
        }

        req.session.usuarioId = usuarioEncontrado._id;
        req.session.usuario   = usuarioEncontrado.usuario;

        res.redirect('/inicio');

    } catch (error) {
        console.error(error);
        res.render('index', { titulo: 'Login', error: 'Error del servidor' });
    }
};

// ── Logout ───────────────────────────────────────────────────────────────────
exports.logout = (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
};

// ── Página de inicio (protegida) ─────────────────────────────────────────────
exports.mostrarInicio = (req, res) => {
    res.render('paginaInicio/Inicio', { usuario: req.session.usuario });
};

// ── Crear usuario admin (uso único de inicialización) ────────────────────────
// [FIX-1] Bloqueado fuera de entorno development.
// Si NODE_ENV no es 'development', la ruta responde 403 y no ejecuta nada.
// Esto garantiza que aunque alguien olvide borrar la ruta del router,
// la funcionalidad esté físicamente deshabilitada en producción/staging.
exports.crearUsuario = async (req, res) => {
    if (process.env.NODE_ENV !== 'development') {
        return res.status(403).json({ message: 'Ruta deshabilitada en producción.' });
    }

    try {
        const existe = await Usuario.findOne({ usuario: 'admin' });
        if (existe) return res.send('El usuario admin ya existe');

        const nuevo = new Usuario({ usuario: 'admin', contrasena: '1234' });
        await nuevo.save();
        res.send('✅ Usuario admin creado con contraseña 1234. Ahora borra esta ruta del código.');
    } catch (err) {
        res.send('Error: ' + err.message);
    }
};

// ── LOGIN API ────────────────────────────────────────────────────────────────
// POST /api/v1/auth/login
// Body JSON: { "usuario": "admin", "contrasena": "1234" }
// Responde:  { success, token, usuario: { id, usuario } }
// Este token se guarda en el móvil y se envía en cada petición:
//   Authorization: Bearer <token>
//
// [FIX-2] Timing attack neutralizado: siempre ejecuta bcrypt.compare(),
// incluso cuando el usuario no existe. Sin este fix, el atacante puede
// enumerar usuarios válidos midiendo el tiempo de respuesta (~100ms de
// diferencia entre "usuario no existe" y "contraseña incorrecta").
exports.loginAPI = async (req, res) => {
    const { usuario, contrasena } = req.body;

    if (!usuario || !contrasena) {
        return res.status(400).json({
            success: false,
            message: 'Usuario y contraseña son requeridos.'
        });
    }

    try {
        const usuarioEncontrado = await Usuario.findOne({ usuario });

        // Siempre comparar contra un hash (real o dummy) para
        // garantizar tiempo de respuesta constante en ambas ramas.
        const hashAComparar = usuarioEncontrado
            ? usuarioEncontrado.contrasena
            : DUMMY_HASH;

        const esValida = await bcrypt.compare(contrasena, hashAComparar);

        // Ambas condiciones de fallo (usuario inexistente o contraseña
        // incorrecta) se resuelven en un solo bloque con el mismo mensaje
        // y el mismo tiempo de respuesta.
        if (!usuarioEncontrado || !esValida) {
            return res.status(401).json({
                success: false,
                message: 'Usuario o contraseña incorrectos.'
            });
        }

        const token = generarToken(usuarioEncontrado);

        res.status(200).json({
            success: true,
            token,
            usuario: {
                id:      usuarioEncontrado._id,
                usuario: usuarioEncontrado.usuario
            }
        });

    } catch (error) {
        console.error('Error loginAPI:', error);
        res.status(500).json({ success: false, message: 'Error del servidor.' });
    }
};