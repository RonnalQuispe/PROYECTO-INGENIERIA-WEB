/**
 * UBICACIÓN: src/controllers/reportes.controller.js
 * Solo orquesta: recibe filtros, llama al service, renderiza.
 */
const reportesService = require('../services/reportes.service');

exports.mostrarDashboard = async (req, res) => {
    const filtros = {
        mes:        req.query.mes        || '',
        anio:       req.query.anio       || '',
        zona:       req.query.zona       || '',
        fechaDesde: req.query.fechaDesde || '',
        fechaHasta: req.query.fechaHasta || ''
    };
    const anioHistorico = req.query.anioHistorico || new Date().getFullYear();

    try {
        const [
            kpis,
            ventasPorMes,
            topProductos,
            productosMenos,
            ventasPorZona,
            clientesFrecuentes,
            topPorMesHistorico,
            abastecimiento,
            ventasPorDia
        ] = await Promise.all([
            reportesService.getKPIs(),
            reportesService.getVentasPorMes(),
            reportesService.getTopProductos(filtros),
            reportesService.getProductosMenosVendidos(filtros),
            reportesService.getVentasPorZona(filtros),
            reportesService.getClientesFrecuentes(filtros),
            reportesService.getTopProductosPorMesHistorico(anioHistorico),
            reportesService.getProyeccionAbastecimiento(),
            reportesService.getVentasPorDia(filtros)
        ]);

        res.render('reportes/dashboard', {
            usuario: req.session.usuario,
            titulo:  'Dashboard — Sistema Jalej',
            kpis,
            chartVentasMes:    JSON.stringify(ventasPorMes),
            chartTopProductos: JSON.stringify(topProductos),
            chartZonas:        JSON.stringify(ventasPorZona),
            chartDias:         JSON.stringify(ventasPorDia),
            topProductos,
            productosMenos,
            ventasPorZona,
            clientesFrecuentes,
            topPorMesHistorico,
            abastecimiento,
            filtros,
            anioHistorico,
            aniosDisponibles: [
                new Date().getFullYear(),
                new Date().getFullYear() - 1,
                new Date().getFullYear() - 2
            ]
        });
    } catch (error) {
        console.error('Error en Dashboard:', error);
        res.status(500).send('Error al cargar el dashboard.');
    }
};