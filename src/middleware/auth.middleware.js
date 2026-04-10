// Middleware de protección de rutas
// Si no hay sesión activa → redirige al login

const isLoggedIn = (req, res, next) => {
    if (req.session && req.session.usuarioId) {
        return next(); // Hay sesión, puede continuar
    }
    // No hay sesión → al login
    res.redirect('/login');
};

module.exports = isLoggedIn;
