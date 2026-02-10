#!/bin/sh

# Crear cron job
echo "00 11 * * * /app/run-reports.sh >> /proc/1/fd/1 2>&1" > /etc/crontabs/root

echo "Cron configurado para ejecutarse a las 11:00 AM CDMX"
echo "Esperando ejecución programada..."

# Iniciar cron en segundo plano
exec crond -f -l 2
