// ============================================================
// seed.js — Datos de prueba para el dashboard
// USO: node seed.js
// ============================================================
const mongoose = require('mongoose');
const Venta    = require('./src/models/venta.model');

const MONGO_URI = 'mongodb://localhost:27017/ingenieriaweb';

const rand    = (a,b) => Math.round((Math.random()*(b-a)+a)*100)/100;
const pick    = arr   => arr[Math.floor(Math.random()*arr.length)];
const addDias = (d,n) => new Date(new Date(d).getTime()+n*86400000);

const CLIENTES = [
    { nombre:'María Fernanda López',   zona:'Norte',  entidad:'Edificio Minerva',   piso:'3' },
    { nombre:'Carlos Andrés Muñoz',    zona:'Centro', entidad:'Torre Comercial 1',  piso:'5' },
    { nombre:'Sofía Valentina Torres', zona:'Sur',    entidad:'Galería El Recreo',  piso:'2' },
    { nombre:'Diego Sebastián Reyes',  zona:'Norte',  entidad:'Edificio Solaris',   piso:'1' },
    { nombre:'Gabriela Estefanía Paz', zona:'Centro', entidad:'Centro Empresarial', piso:'4' },
    { nombre:'Luis Miguel Herrera',    zona:'Sur',    entidad:'Plaza Central',      piso:'6' },
    { nombre:'Valeria Cristina Ortiz', zona:'Norte',  entidad:'Torre Norte',        piso:'2' },
    { nombre:'Andrés Felipe Mora',     zona:'Centro', entidad:'Edificio Cóndor',   piso:'3' },
    { nombre:'Daniela Alejandra Ruiz', zona:'Sur',    entidad:'Complejo Sur',       piso:'1' },
    { nombre:'Javier Esteban Castro',  zona:'Norte',  entidad:'Edificio Quito',     piso:'7' },
];

const PRODUCTOS = [
    ['Almuerzo ejecutivo',3.5,5],['Menú del día',2.5,4],['Bandeja especial',4,6.5],
    ['Jugo natural',0.75,1.5],  ['Sopa + segundo',2,3.5],['Combo familiar',12,18],
];

const METODOS = ['efectivo','transferencia','deposito'];

function generarVentas(cliente, ref, moroso) {
    const ventas = [];
    const n      = moroso ? rand(3,6) : rand(5,10);
    let fecha    = addDias(new Date(), -180);

    for (let i=0; i<n; i++) {
        const [prod,pMin,pMax] = pick(PRODUCTOS);
        const precio   = rand(pMin, pMax);
        const cantidad = Math.floor(rand(1,10));
        const total    = Math.round(precio*cantidad*100)/100;
        const cobros   = [];
        let totalPagado = 0;

        if (!moroso || Math.random()>0.4) {
            const demora = moroso ? Math.floor(rand(20,60)) : Math.floor(rand(1,5));
            const frac   = moroso ? rand(0.2,0.9) : (Math.random()<0.2 ? rand(0.3,0.7) : 1);
            const monto  = Math.round(total*frac*100)/100;
            const fCobro = addDias(fecha, demora);
            if (fCobro <= new Date()) {
                cobros.push({ monto, metodo:pick(METODOS), referencia:'', fecha:fCobro, cobradoPor:'Sistema' });
                totalPagado = monto;
            }
        }

        ventas.push({
            zona: cliente.zona,
            ubicacion: { entidad:cliente.entidad, piso:cliente.piso },
            clienteRef: ref, cliente:cliente.nombre,
            producto:prod, precioUnitario:precio, cantidad, total, totalPagado,
            estadoPago: totalPagado<=0?'pendiente':totalPagado>=total?'pagado':'parcial',
            cobros, fecha, tipoTransaccion:'venta', estadoEntrega:'Inmediata',
            items:[], historialEdiciones:[]
        });
        fecha = addDias(fecha, Math.floor(rand(10,30)));
    }
    return ventas;
}

async function seed() {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Conectado');
    await Venta.deleteMany({});
    const todas = CLIENTES.flatMap((c,i) => generarVentas(c, new mongoose.Types.ObjectId(), i<3));
    await Venta.insertMany(todas, { ordered:false });
    console.log(`✅ ${todas.length} ventas insertadas (${CLIENTES.length} clientes)`);
    await mongoose.disconnect();
    process.exit(0);
}

seed().catch(e => { console.error('❌', e.message); process.exit(1); });