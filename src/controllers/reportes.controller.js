const Venta = require('../models/venta.model');
const { analizarCartera } = require('../coreCartera');

const UMBRAL = 200;
const CAMPOS = 'cliente clienteRef fecha total totalPagado estadoPago zona cobros';
const nivel  = m => m >= 0.7 ? 'alto' : m >= 0.4 ? 'medio' : 'bajo';

exports.mostrarDashboard = async (req, res) => {
    try {
        const ventas   = await Venta.find({}).select(CAMPOS).lean();
        const analisis = analizarCartera(ventas, UMBRAL);
        const saldo    = analisis.clientes.reduce((s, c) => s + c.saldoPendiente, 0);

        res.render('reportes/dashboard', {
            titulo:              'Dashboard Analítico — Sistema Jalej',
            usuario:             req.session?.usuario || null,
            curvaProyeccion:     analisis.proyeccion.curva.map(s => ({
                label:    'Sem ' + s.semana,
                esperado: s.recaudacionEsperada,
                clientes: s.clientesEsperados.join(', ') || '—'
            })),
            mapaCalor:           analisis.mapaCalorSemanal,
            rankingRiesgo:       analisis.rankingRiesgo.map(c => ({ ...c, nivelRiesgo: nivel(c.indiceMorosidad) })),
            runwayDias:          analisis.proyeccion.runwayDias,
            runwayFecha:         analisis.proyeccion.runwayFecha,
            umbralSemanal:       UMBRAL,
            totalClientes:       analisis.clientes.length,
            clientesEnRiesgo:    analisis.clientes.filter(c => c.indiceMorosidad >= 0.7).length,
            saldoTotalPendiente: Math.round(saldo * 100) / 100
        });
    } catch (e) {
        console.error('[Dashboard]', e);
        res.status(500).send('Error: ' + e.message);
    }
};