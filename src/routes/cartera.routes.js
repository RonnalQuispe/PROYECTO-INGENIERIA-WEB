/**
 * UBICACIÓN: src/routes/cartera.routes.js
 */
const express        = require('express');
const router         = express.Router();
const { isLoggedIn } = require('../middleware/auth.middleware');
const carteraCtrl    = require('../controllers/cartera.controller');

router.use(isLoggedIn);

// ── API (app móvil) — van PRIMERO para que Express no las confunda con nombres de cliente ──
router.get('/api',                  carteraCtrl.listarAPI);        // GET  /api/v1/cartera (lista)
router.put('/:ventaId/editar',      carteraCtrl.editarVentaAPI);   // PUT  /api/v1/cartera/:ventaId/editar
router.delete('/:ventaId',          carteraCtrl.eliminarVentaAPI); // DELETE /api/v1/cartera/:ventaId

// ── Web ───────────────────────────────────────────────────────────────────────
router.get('/',          carteraCtrl.mostrarCartera);  // Resumen global
router.get('/:cliente',  carteraCtrl.mostrarDetalle);  // Detalle por cliente

module.exports = router;