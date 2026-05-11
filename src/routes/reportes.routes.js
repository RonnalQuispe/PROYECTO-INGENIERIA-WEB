const express = require('express');
const router  = express.Router();
const { isLoggedIn } = require('../middleware/auth.middleware'); // ← usa el centralizado
const reportesController = require('../controllers/reportes.controller');

router.get('/', isLoggedIn, reportesController.mostrarDashboard);

module.exports = router;