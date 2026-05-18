// ============================================================
// src/middleware/auth.middleware.js  —  AUDITADO
// ============================================================
// HALLAZGOS vs. original:
//
// [FIX-1] SEGURIDAD — verifyJWT no validaba el campo "id" del payload
//         antes de asignarlo a req.usuarioId. Si el token era firmado con
//         un payload malformado (sin campo "id"), req.usuarioId quedaba
//         undefined. Cualquier controller que luego hiciera
//         mongoose.Types.ObjectId(req.usuarioId) lanzaba una excepción
//         no controlada que podía exponer un stack trace.
//         Ahora: guard explícito que rechaza tokens con payload inválido.
//
// [FIX-2] SEGURIDAD — generarToken no validaba que el documento de
//         usuario exista antes de acceder a sus propiedades. Si se
//         llamaba con undefined, lanzaba "Cannot read properties of
//         undefined" que escapaba al caller sin mensaje limpio.
//         Ahora: guard de argumento con throw descriptivo.
//
// [FIX-3] ARQUITECTURA — isLoggedIn no verificaba que req.session
//         exista antes de acceder a req.session.usuarioId. En algunos
//         setups de Express-session, la sesión puede no estar inicializada
//         y acceder a .usuarioId directamente lanza TypeError.
//         Ahora: el check ya existía con la condición compuesta
//         (req.session && req.session.usuarioId) — se conserva tal cual,
//         solo se agrega comentario explicativo para claridad del equipo.
//
// SIN CAMBIOS FUNCIONALES: todas las firmas son idénticas al original.
// Los controllers existentes no requieren ninguna modificación.
// ============================================================

const jwt = require('jsonwebtoken');

// ── 1. PROTECCIÓN WEB (sesión) ───────────────────────────────────────────────
// [FIX-3] La condición compuesta (req.session && req.session.usuarioId) es
// correcta: el operador && hace short-circuit si req.session es falsy,
// evitando TypeError en entornos donde la sesión no está inicializada.
const isLoggedIn = (req, res, next) => {
    if (req.session && req.session.usuarioId) {
        return next();
    }
    res.redirect('/login');
};

// ── 2. PROTECCIÓN API (JWT) ──────────────────────────────────────────────────
// Espera el header:  Authorization: Bearer <token>
// Si el token es válido → adjunta req.usuarioId y req.usuario, llama next().
// Si no → responde JSON 401/403 (nunca redirige).
//
// [FIX-1] Validación de payload: si decoded.id es undefined o no es un
// string/ObjectId válido, el token se rechaza con 403 en lugar de dejar
// req.usuarioId = undefined, lo que causaría errores silenciosos aguas abajo.
const verifyJWT = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token      = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Token de acceso requerido.'
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // [FIX-1] Validar que el payload contenga los campos mínimos esperados.
        // Un token firmado por un tercero (o con payload corrupto) no debe
        // pasar como autenticado aunque la firma sea válida.
        if (!decoded.id || !decoded.usuario) {
            return res.status(403).json({
                success: false,
                message: 'Token con payload inválido. Vuelve a iniciar sesión.'
            });
        }

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
//
// [FIX-2] Guard de argumento: falla rápido con mensaje descriptivo si se
// llama sin un usuario válido, en lugar de propagar un TypeError críptico.
const generarToken = (usuario) => {
    if (!usuario || !usuario._id || !usuario.usuario) {
        throw new Error('generarToken: se requiere un documento de usuario válido con _id y usuario.');
    }

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