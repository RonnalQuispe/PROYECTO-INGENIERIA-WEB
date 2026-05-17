// ============================================================
// src/middleware/auth.middleware.js
// ============================================================
// Exporta TRES funciones:
//   isLoggedIn  → protege rutas web (sesión Express)
//   verifyJWT   → protege rutas /api/v1 (Bearer token)
//   generarToken→ crea un JWT firmado para el login API
// ============================================================

const jwt = require('jsonwebtoken');

// ── 1. PROTECCIÓN WEB (sesión) ───────────────────────────────────────────────
// Comportamiento IDÉNTICO al middleware original.
// Si no hay sesión → redirige al login (navegador).
const isLoggedIn = (req, res, next) => {
    if (req.session && req.session.usuarioId) {
        return next();
    }
    res.redirect('/login');
};

// ── 2. PROTECCIÓN API (JWT) ──────────────────────────────────────────────────
// Espera el header:  Authorization: Bearer <token>
// Si el token es válido → adjunta req.usuarioId y req.usuario, llama next().
// Si no → responde JSON 401/403 (nunca redirige, la app móvil no usa HTML).
const verifyJWT = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Token de acceso requerido.'
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.usuarioId = decoded.id;
        req.usuario   = decoded.usuario;
        next();
    } catch (err) {
        return res.status(403).json({
            success: false,
            message: 'Token inválido o expirado. Vuelve a iniciar sesión.'
        });
    }
};

// ── 3. GENERADOR DE TOKEN ────────────────────────────────────────────────────
// Recibe el documento de Mongoose del usuario.
// Devuelve un string JWT firmado con los datos mínimos necesarios.
const generarToken = (usuario) => {
    return jwt.sign(
        {
            id:      usuario._id,
            usuario: usuario.usuario
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
};

module.exports = { isLoggedIn, verifyJWT, generarToken };