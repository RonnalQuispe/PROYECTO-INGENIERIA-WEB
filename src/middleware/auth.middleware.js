// src/middleware/auth.middleware.js
const jwt = require('jsonwebtoken');

// ── Para el navegador web (sin cambios en comportamiento) ────────────────────
const isLoggedIn = (req, res, next) => {
    if (req.session && req.session.usuarioId) {
        return next();
    }
    res.redirect('/login');
};

// ── Para la app móvil (JWT en el header Authorization) ──────────────────────
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
            message: 'Token inválido o expirado.'
        });
    }
};

// ── Helper para generar tokens ───────────────────────────────────────────────
const generarToken = (usuario) => {
    return jwt.sign(
        { id: usuario._id, usuario: usuario.usuario },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
};

module.exports = { isLoggedIn, verifyJWT, generarToken };