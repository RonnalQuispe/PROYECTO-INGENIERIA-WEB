const express    = require('express');
const router     = express.Router();
const isLoggedIn = require('../middleware/auth.middleware');
const authCtrl   = require('../controllers/auth.controller');

// Página de inicio (raíz → al login si no hay sesión)
router.get('/', (req, res) => res.redirect('/login'));

// Login
router.get('/login',  authCtrl.mostrarLogin);
router.post('/login', authCtrl.procesarLogin);

// Logout
router.get('/logout', authCtrl.logout);

// Inicio protegido
router.get('/inicio', isLoggedIn, authCtrl.mostrarInicio);

// Ruta de setup (crear usuario admin por primera vez)
// ⚠️ BORRAR después de usarla una vez
router.get('/setup', authCtrl.crearUsuario);

module.exports = router;
