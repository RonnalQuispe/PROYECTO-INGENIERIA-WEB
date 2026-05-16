/**
 * UBICACIÓN: src/routes/cartera.routes.js
 */
const express        = require('express');
const router         = express.Router();
const { isLoggedIn } = require('../middleware/auth.middleware');
const carteraCtrl    = require('../controllers/cartera.controller');

router.use(isLoggedIn);

// ── Web ───────────────────────────────────────────────────────────────────────
router.get('/',          carteraCtrl.mostrarCartera);  // Resumen global
router.get('/:cliente',  carteraCtrl.mostrarDetalle);  // Detalle por cliente

// ── API (app móvil) ───────────────────────────────────────────────────────────
// FIX: esta ruta faltaba — era la causa del error "no se pudo guardar la edición"
// Debe ir ANTES de /:cliente para que Express no la confunda con un nombre de cliente
router.put('/:ventaId/editar', carteraCtrl.editarVentaAPI);

module.exports = router;