const Venta = require('../models/venta.model');
const { analizarCartera } = require('../coreCartera');

const CAMPOS = 'cliente clienteRef fecha total totalPagado cobros';
const nivel  = morosisad => morosisad >= 0.7 ? 'alto' : morosisad >= 0.4 ? 'medio' : 'bajo';

exports.mostrarDashboard = async (req, res) => {
    try {
        //consulta bdd ventas colelction
        const ventas   = await Venta.find({}).select(CAMPOS).lean();
        //procesa dt financiera
        const analisis = analizarCartera(ventas);
        //carpeta
        res.render('reportes/dashboard', {
            titulo:        'Dashboard — Sistema Jalej',
            usuario:       req.session?.usuario || null,
            //cp los datos del cliente
            rankingRiesgo: analisis.rankingRiesgo.map(copia => ({ ...copia, nivelRiesgo: nivel(copia.indiceMorosidad) }))
        });
    } catch (e) {
        console.error('[Dashboard]', e);
        res.status(500).send('Error: ' + e.message);
    }
};