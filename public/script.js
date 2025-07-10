// public/script.js
$(document).ready(function() {
    $('#buyButton').on('click', function() {
        const amount = 1000; // Monto del producto de prueba
        const email = $('#customerEmail').val();

        if (!email) {
            $('#error').text('Por favor, ingresa tu email.').show();
            return;
        }

        $('#loading').show();
        $('#error').hide();
        $('#buyButton').prop('disabled', true); // Deshabilita el botón mientras procesa

        $.ajax({
            url: '/api/createPayment',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ amount: amount, email: email }),
            success: function(response) {
                if (response.success) {
                    // Redirige al usuario a la URL de pago de Flow Sandbox
                    window.location.href = response.flowUrl;
                } else {
                    $('#error').text('Error al iniciar el pago: ' + (response.message || 'Desconocido')).show();
                    $('#loading').hide();
                    $('#buyButton').prop('disabled', false);
                }
            },
            error: function(jqXHR, textStatus, errorThrown) {
                $('#error').text('Error de conexión con el servidor: ' + textStatus).show();
                console.error('AJAX Error:', textStatus, errorThrown, jqXHR.responseText);
                $('#loading').hide();
                $('#buyButton').prop('disabled', false);
            }
        });
    });
});