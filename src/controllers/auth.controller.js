const Usuario = require('../models/usuario.model');
const { generarToken } = require('../middleware/auth.middleware');
// ── Mostrar página de login ──────────────────────────────────────────────────
exports.mostrarLogin = (req, res) => {
    // Si ya hay sesión, ir directo al inicio
    if (req.session.usuarioId) return res.redirect('/inicio');
    res.render('index', { titulo: 'AdminExpress - Login', error: null });
};

// ── Procesar login ───────────────────────────────────────────────────────────
exports.procesarLogin = async (req, res) => {
    const { usuario, contrasena } = req.body;

    try {
        // 1. Buscar usuario en BD
        const usuarioEncontrado = await Usuario.findOne({ usuario });

        if (!usuarioEncontrado) {
            return res.render('index', { titulo: 'Login', error: 'Usuario o contraseña incorrectos' });
        }

        // 2. Comparar contraseña
        const esValida = await usuarioEncontrado.compararContrasena(contrasena);

        if (!esValida) {
            return res.render('index', { titulo: 'Login', error: 'Usuario o contraseña incorrectos' });
        }

        // 3. Crear sesión
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

// ── Crear usuario (para inicializar la BD - uso único) ───────────────────────
exports.crearUsuario = async (req, res) => {
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
// POST /api/v1/auth/login  →  responde JSON + JWT (para la app móvil)
exports.loginAPI = async (req, res) => {
    const { usuario, contrasena } = req.body;

    try {
        const usuarioEncontrado = await Usuario.findOne({ usuario });

        if (!usuarioEncontrado) {
            return res.status(401).json({
                success: false,
                message: 'Usuario o contraseña incorrectos.'
            });
        }

        const esValida = await usuarioEncontrado.compararContrasena(contrasena);

        if (!esValida) {
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
        console.error(error);
        res.status(500).json({ success: false, message: 'Error del servidor.' });
    }
};