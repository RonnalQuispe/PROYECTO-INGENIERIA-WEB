/**
 * ============================================================
 * RUTA: /dashboard  — dashboard.js (o routes/dashboard.js)
 * ============================================================
 * Conecta el core de análisis con la vista dashboard.ejs.
 *
 * COLOCA ESTE ARCHIVO en: routes/dashboard.js
 *
 * REGISTRA LA RUTA en tu app.js así:
 *   const dashboardRoutes = require('./routes/dashboard');
 *   app.use('/dashboard', dashboardRoutes);
 *
 * ASEGÚRATE de que el modelo Venta esté importado con el
 * schema correcto (cobros embebidos, totalPagado, etc.)
 * ============================================================
 */

const express      = require('express');
const router       = express.Router();
const Venta        = require('../models/Venta');       // ajusta la ruta a tu modelo
const { analizarCartera } = require('../coreCartera'); // ajusta la ruta donde guardaste el core

// Middleware de autenticación (usa el que ya tengas en tu proyecto)
// const requireAuth = require('../middleware/auth');

/**
 * GET /dashboard
 *
 * 1. Obtiene todas las ventas con sus cobros embebidos.
 * 2. Pasa las ventas al core de análisis.
 * 3. Envía los resultados a la vista dashboard.ejs.
 */
router.get('/', /* requireAuth, */ async (req, res) => {
    try {

        // ── Traer todas las ventas desde MongoDB ──────────────
        // Seleccionamos solo los campos que el core necesita.
        // Si tus cobros están en un modelo separado, haz aquí el populate.
        const ventas = await Venta.find({})
            .select('cliente fecha total totalPagado estadoPago zona cobros')
            .lean(); // .lean() devuelve objetos JS planos, más rápido para calcular

        // ── Umbral de liquidez semanal ─────────────────────────
        // Define cuánto dinero necesita ingresar por semana para que
        // el negocio opere sin tensión. Puedes hacerlo configurable
        // desde una colección "configuracion" en MongoDB si quieres.
        const UMBRAL_SEMANAL = 200; // ajusta este valor a tu negocio

        // ── Ejecutar el core de análisis (las 3 capas) ─────────
        const analisis = analizarCartera(ventas, UMBRAL_SEMANAL);
        /*
         * analisis contiene:
         *   .clientes         → análisis completo por cliente
         *   .proyeccion       → { curva (8 semanas), runwayFecha, runwayDias }
         *   .rankingRiesgo    → top 10 clientes por riesgo ponderado
         *   .mapaCalorSemanal → cobros históricos por día de la semana
         */

        // ── Preparar datos para la vista ───────────────────────

        // Curva de proyección: solo enviamos los datos que el gráfico necesita
        const curvaProyeccion = analisis.proyeccion.curva.map(s => ({
            label:    'Sem ' + s.semana,
            esperado: s.recaudacionEsperada,
            umbral:   UMBRAL_SEMANAL,
            clientes: s.clientesEsperados.join(', ') || '—'
        }));

        // Ranking: top clientes en riesgo con etiqueta de nivel
        const rankingConEtiqueta = analisis.rankingRiesgo.map(c => ({
            ...c,
            nivelRiesgo: c.indiceMorosidad >= 0.7 ? 'alto'
                       : c.indiceMorosidad >= 0.4 ? 'medio'
                       : 'bajo'
        }));

        // ── Renderizar la vista ─────────────────────────────────
        res.render('dashboard', {
            titulo:           'Dashboard Analítico',

            // Datos del core para los 3 widgets principales
            curvaProyeccion,                          // gráfico de barras (8 semanas)
            rankingRiesgo:    rankingConEtiqueta,      // tabla de riesgo
            mapaCalor:        analisis.mapaCalorSemanal, // gráfico de barras diario

            // Datos del runway (liquidez)
            runwayDias:       analisis.proyeccion.runwayDias,
            runwayFecha:      analisis.proyeccion.runwayFecha,

            // Umbral para mostrarlo en la vista
            umbralSemanal:    UMBRAL_SEMANAL,

            // KPIs rápidos
            totalClientes:    analisis.clientes.length,
            clientesEnRiesgo: analisis.clientes.filter(c => c.indiceMorosidad >= 0.7).length,
            saldoTotalPendiente: analisis.clientes.reduce((s, c) => s + c.saldoPendiente, 0)
        });

    } catch (error) {
        console.error('[Dashboard] Error al calcular análisis:', error);
        res.status(500).render('error', { mensaje: 'Error al cargar el dashboard.' });
    }
});

module.exports = router;
