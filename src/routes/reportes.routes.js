const express            = require('express');
const router             = express.Router();
const { isLoggedIn }     = require('../middleware/auth.middleware');
const reportesController = require('../controllers/reportes.controller');
const rateLimit          = require('express-rate-limit');

// 60 req/min — protege los pipelines de MongoDB ante polling excesivo
const reportesLimiter = rateLimit({
    windowMs:        60 * 1000,
    max:             60,
    standardHeaders: true,
    legacyHeaders:   false,
    handler: (req, res) => res.status(429).render('error', {
        mensaje: 'Demasiadas peticiones al dashboard. Espera un momento.'
    })
});

router.get('/', isLoggedIn, reportesLimiter, reportesController.mostrarDashboard);

module.exports = router;