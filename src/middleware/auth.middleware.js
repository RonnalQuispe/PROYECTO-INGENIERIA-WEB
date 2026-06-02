

const jwt = require('jsonwebtoken');


const isLoggedIn = (req, res, next) => {
    if (req.session && req.session.usuarioId) {
        return next();
    }
    res.redirect('/login');
};

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