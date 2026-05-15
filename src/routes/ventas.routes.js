// ============================================================
// src/routes/ventas.routes.js
// ✅ CORRECCIÓN: Añadida ruta GET /ventas/detalle/:id
// ============================================================
const express    = require('express');
const router     = express.Router();
const { isLoggedIn } = require('../middleware/auth.middleware');
const ventasCtrl = require('../controllers/ventas.controller');

router.use(isLoggedIn);

router.get('/',                ventasCtrl.listar);          // Listar + filtros
router.get('/crear',           ventasCtrl.mostrarCrear);    // Formulario crear
router.post('/guardar',        ventasCtrl.guardar);         // Guardar nueva venta
// ✅ NUEVO: Ver detalle completo de una venta
router.get('/detalle/:id',     ventasCtrl.mostrarDetalle);
router.get('/editar/:id',      ventasCtrl.mostrarEditar);   // Formulario editar
router.post('/editar/:id',     ventasCtrl.actualizar);      // Actualizar venta
router.get('/eliminar/:id',    ventasCtrl.eliminar);        // Eliminar venta
router.post('/cobrar/:id',     ventasCtrl.registrarCobro);  // Registrar cobro

module.exports = router;