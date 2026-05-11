/**
 * UBICACIÓN: src/routes/reportes.routes.js
 */
const express = require('express');
const router  = express.Router();
const reportesController = require('../controllers/reportes.controller');

// Middleware de autenticación — ajusta el nombre si el tuyo es diferente
function isAuth(req, res, next) {
    if (req.session && req.session.usuario) return next();
    return res.redirect('/login');
}

// GET /reportes  →  Dashboard analítico
router.get('/', isAuth, reportesController.mostrarDashboard);

module.exports = router;    // ← AGREGA ESTA LÍNEA