// ============================================================
// src/controllers/reportes.controller.js
// ============================================================
// Usa el core de análisis de cartera (coreCartera.js) con el
// modelo real de Venta para alimentar el dashboard.ejs
// ============================================================

const Venta = require('../models/venta.model');
const { analizarCartera } = require('../coreCartera'); // ajusta la ruta si es distinta

// Umbral de liquidez semanal: cuánto necesita ingresar por semana el negocio
const UMBRAL_SEMANAL = 200;

// ─────────────────────────────────────────────────────────────
// GET /reportes  →  renderiza views/reportes/dashboard.ejs
// ─────────────────────────────────────────────────────────────
exports.mostrarDashboard = async (req, res) => {
    try {

        // Traer todas las ventas con los campos que necesita el core
        // .lean() devuelve objetos JS planos (más rápido para calcular)
        const ventas = await Venta.find({})
            .select('cliente clienteRef fecha total totalPagado estadoPago zona cobros')
            .lean();

        // Ejecutar las 3 capas del core de análisis
        const analisis = analizarCartera(ventas, UMBRAL_SEMANAL);

        // Preparar la curva de proyección para el gráfico de barras
        const curvaProyeccion = analisis.proyeccion.curva.map(function(s) {
            return {
                label:    'Sem ' + s.semana,
                esperado: s.recaudacionEsperada,
                umbral:   UMBRAL_SEMANAL,
                clientes: s.clientesEsperados.join(', ') || '—'
            };
        });

        // Agregar etiqueta de nivel a cada cliente del ranking
        const rankingRiesgo = analisis.rankingRiesgo.map(function(c) {
            return Object.assign({}, c, {
                nivelRiesgo: c.indiceMorosidad >= 0.7 ? 'alto'
                           : c.indiceMorosidad >= 0.4 ? 'medio'
                           : 'bajo'
            });
        });

        // Saldo total pendiente de toda la cartera
        const saldoTotalPendiente = analisis.clientes.reduce(function(sum, c) {
            return sum + c.saldoPendiente;
        }, 0);

        // Renderizar la vista con todas las variables que necesita el dashboard
        res.render('reportes/dashboard', {
            titulo:              'Dashboard Analítico — Sistema Jalej',
            usuario:             req.session ? req.session.usuario : null,

            // Datos para los gráficos (leídos desde JSON en el EJS)
            curvaProyeccion:     curvaProyeccion,
            mapaCalor:           analisis.mapaCalorSemanal,
            rankingRiesgo:       rankingRiesgo,

            // Runway de liquidez
            runwayDias:          analisis.proyeccion.runwayDias,
            runwayFecha:         analisis.proyeccion.runwayFecha,
            umbralSemanal:       UMBRAL_SEMANAL,

            // KPIs rápidos
            totalClientes:       analisis.clientes.length,
            clientesEnRiesgo:    analisis.clientes.filter(function(c) {
                                     return c.indiceMorosidad >= 0.7;
                                 }).length,
            saldoTotalPendiente: Math.round(saldoTotalPendiente * 100) / 100
        });

    } catch (error) {
        console.error('[Dashboard] Error:', error);
        res.status(500).send('Error al cargar el dashboard: ' + error.message);
    }
};

// ─────────────────────────────────────────────────────────────
// API — GET /api/v1/reportes/dashboard  →  JSON para app móvil
// ─────────────────────────────────────────────────────────────
exports.dashboardAPI = async (req, res) => {
    try {
        const ventas   = await Venta.find({}).select('cliente clienteRef fecha total totalPagado estadoPago zona cobros').lean();
        const analisis = analizarCartera(ventas, UMBRAL_SEMANAL);

        res.json({
            success: true,
            data: {
                clientes:         analisis.clientes,
                rankingRiesgo:    analisis.rankingRiesgo,
                mapaCalorSemanal: analisis.mapaCalorSemanal,
                proyeccion: {
                    curva:       analisis.proyeccion.curva,
                    runwayDias:  analisis.proyeccion.runwayDias,
                    runwayFecha: analisis.proyeccion.runwayFecha
                },
                umbralSemanal: UMBRAL_SEMANAL
            }
        });
    } catch (error) {
        console.error('[dashboardAPI] Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────
// API — GET /api/v1/reportes/kpis  →  KPIs rápidos en JSON
// ─────────────────────────────────────────────────────────────
exports.kpisAPI = async (req, res) => {
    try {
        const ventas   = await Venta.find({}).select('total totalPagado estadoPago cobros cliente fecha zona').lean();
        const analisis = analizarCartera(ventas, UMBRAL_SEMANAL);
        const saldoTotal = analisis.clientes.reduce(function(s, c) { return s + c.saldoPendiente; }, 0);

        res.json({
            success: true,
            data: {
                totalClientes:       analisis.clientes.length,
                clientesEnRiesgo:    analisis.clientes.filter(function(c) { return c.indiceMorosidad >= 0.7; }).length,
                saldoTotalPendiente: Math.round(saldoTotal * 100) / 100,
                runwayDias:          analisis.proyeccion.runwayDias,
                umbralSemanal:       UMBRAL_SEMANAL
            }
        });
    } catch (error) {
        console.error('[kpisAPI] Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};