// server.js
require('dotenv').config(); // Carga las variables de entorno desde .env
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const crypto = require('crypto'); // Para firmar las solicitudes a Flow

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public')); // Sirve archivos estáticos desde la carpeta 'public'

// Credenciales y URLs de Flow desde .env
const FLOW_API_KEY = process.env.FLOW_API_KEY;
const FLOW_SECRET_KEY = process.env.FLOW_SECRET_KEY;
const FLOW_SANDBOX_URL = process.env.FLOW_SANDBOX_URL;
const APP_BASE_URL = process.env.APP_BASE_URL; // Tu URL base para callbacks y retornos

// --- Funciones auxiliares para Flow ---

// Función para generar la firma (signature) para las solicitudes a Flow
function signParams(params, secretKey) {
    const sortedKeys = Object.keys(params).sort();
    let signatureString = '';
    sortedKeys.forEach(key => {
        signatureString += `${key}${params[key]}`;
    });
    return crypto.createHmac('sha256', secretKey).update(signatureString).digest('hex');
}

// --- Rutas del API ---

// 1. Ruta para crear una orden de pago en Flow
app.post('/api/createPayment', async (req, res) => {
    try {
        const { amount, email } = req.body; // Recibimos el monto y email desde el frontend

        const orderId = `ORDER-${Date.now()}`; // ID único para tu orden interna
        const subject = 'Compra de Producto de Prueba';

        const params = {
            apiKey: FLOW_API_KEY,
            commerceOrder: orderId,
            subject: subject,
            amount: amount,
            email: email,
            urlConfirmation: `${APP_BASE_URL}/api/paymentConfirmation`, // URL donde Flow enviará el callback (IPN)
            urlReturn: `${APP_BASE_URL}/paymentStatus/${orderId}`,      // URL a la que Flow redirigirá al cliente
            optional: JSON.stringify({ userId: 'user123', product: 'DemoProduct' }) // Datos adicionales si los necesitas

           
        };
        console.log(params);

        params.s = signParams(params, FLOW_SECRET_KEY); // Genera la firma

        const response = await axios.post(`${FLOW_SANDBOX_URL}/payment/create`, params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        if (response.data && response.data.url && response.data.token) {
            console.log('Pago creado en Flow:', response.data);
            res.json({
                success: true,
                flowUrl: `${response.data.url}?token=${response.data.token}`,
                token: response.data.token,
                orderId: orderId
            });
        } else {
            console.error('Error al crear pago en Flow:', response.data);
            res.status(500).json({ success: false, message: 'Error al iniciar pago con Flow.', details: response.data });
        }

    } catch (error) {
        console.error('Error en /api/createPayment:', error.message);
        if (error.response) {
            console.error('Flow API Error Data:', error.response.data);
        }
        res.status(500).json({ success: false, message: 'Error interno del servidor al crear pago.' });
    }
});

// 2. Ruta para el callback (IPN) de Flow - Confirmación de Pago
app.post('/api/paymentConfirmation', async (req, res) => {
    try {
        const flowResponse = req.body;
        console.log('Callback de Flow recibido:', flowResponse);

        // Verifica la firma del callback (¡CRUCIAL para la seguridad!)
        const signatureToVerify = flowResponse.s;
        const receivedParams = { ...flowResponse };
        delete receivedParams.s; // Elimina la firma para no incluirla en el cálculo
        const calculatedSignature = signParams(receivedParams, FLOW_SECRET_KEY);

        if (calculatedSignature !== signatureToVerify) {
            console.warn('Firma de callback inválida. Posible manipulación.');
            return res.status(403).send('Invalid Signature');
        }

        // Si la firma es válida, procesa el pago
        if (flowResponse.status === '1') {
            console.log(`Pago APROBADO para Orden: ${flowResponse.commerceOrder}, Token: ${flowResponse.token}`);
            // Aquí deberías actualizar el estado de tu orden en tu base de datos
            // Por ejemplo: database.updateOrderStatus(flowResponse.commerceOrder, 'completed');
        } else {
            console.log(`Pago RECHAZADO o PENDIENTE para Orden: ${flowResponse.commerceOrder}, Status: ${flowResponse.status}`);
            // Aquí deberías actualizar el estado a rechazado o pendiente
            // Por ejemplo: database.updateOrderStatus(flowResponse.commerceOrder, 'failed');
        }

        // Responder con "OK" para que Flow sepa que recibimos el callback
        res.send('OK');

    } catch (error) {
        console.error('Error en /api/paymentConfirmation:', error.message);
        res.status(500).send('Error processing confirmation');
    }
});

// 3. Ruta para consultar el estado del pago desde el frontend
app.get('/api/paymentStatus/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        // En un proyecto real, consultarías tu base de datos aquí
        // para obtener el estado actual de la orden usando orderId.
        // Por ahora, simularemos un estado.
        console.log(`Consultando estado para orden: ${orderId}`);

        // Opcional: Podrías también consultar a Flow para el estado final del pago
        // Pero lo más robusto es confiar en tu BD actualizada por el callback.
        // Ejemplo de consulta a Flow (solo para referencia, el callback es preferido):
        const params = {
            apiKey: FLOW_API_KEY,
            token: req.query.token // Si Flow te devuelve el token en la URL de retorno
        };
        params.s = signParams(params, FLOW_SECRET_KEY);
        console.log(params);

        const flowStatusResponse = await axios.get(`${FLOW_SANDBOX_URL}/payment/getStatus`, { params });
        console.log('Estado de Flow (getStatus):', flowStatusResponse.data);

        // Devuelve el estado relevante al frontend
        res.json({
            success: true,
            status: flowStatusResponse.data.status, // 1: Aprobado, 2: Rechazado, 3: Pendiente
            flowResponse: flowStatusResponse.data
        });

    } catch (error) {
        console.error('Error en /api/paymentStatus:', error.message);
        res.status(500).json({ success: false, message: 'Error al consultar estado del pago.' });
    }
});

// 4. Ruta para servir la página de estado de pago al cliente
app.get('/paymentStatus/:orderId', (req, res) => {
    // Esta ruta simplemente carga la página HTML que luego consultará el estado via AJAX
    res.sendFile(__dirname + '/public/paymentStatus.html');
});


// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
    console.log(`¡Recuerda iniciar tus pruebas en Flow Sandbox!`);

});


