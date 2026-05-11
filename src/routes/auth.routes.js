const express    = require('express');
const router     = express.Router();
const { isLoggedIn } = require('../middleware/auth.middleware'); // ← desestructura
const authCtrl   = require('../controllers/auth.controller');

router.get('/', (req, res) => res.redirect('/login'));
router.get('/login',  authCtrl.mostrarLogin);
router.post('/login', authCtrl.procesarLogin);
router.get('/logout', authCtrl.logout);
router.get('/inicio', isLoggedIn, authCtrl.mostrarInicio);
router.get('/setup',  authCtrl.crearUsuario);

module.exports = router;