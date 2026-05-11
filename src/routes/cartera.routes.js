/**
 * UBICACIÓN: src/routes/cartera.routes.js
 */
const express      = require('express');
const router       = express.Router();
const isLoggedIn   = require('../middleware/auth.middleware');
const carteraCtrl  = require('../controllers/cartera.controller');

router.use(isLoggedIn);

router.get('/',                 carteraCtrl.mostrarCartera);   // Resumen global
router.get('/:cliente',         carteraCtrl.mostrarDetalle);   // Detalle por cliente

module.exports = router;