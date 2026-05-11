const express    = require('express');
const router     = express.Router();
const { isLoggedIn } = require('../middleware/auth.middleware'); // ← desestructura
const ventasCtrl = require('../controllers/ventas.controller');

router.use(isLoggedIn); 

router.get('/',              ventasCtrl.listar);          // Listar + filtros
router.get('/crear',         ventasCtrl.mostrarCrear);    // Formulario crear
router.post('/guardar',      ventasCtrl.guardar);         // Guardar nueva venta
router.get('/editar/:id',    ventasCtrl.mostrarEditar);   // Formulario editar
router.post('/editar/:id',   ventasCtrl.actualizar);      // Actualizar venta
router.get('/eliminar/:id',  ventasCtrl.eliminar);        // Eliminar venta
router.post('/cobrar/:id',   ventasCtrl.registrarCobro);  // ← NUEVO: registrar cobro

module.exports = router;