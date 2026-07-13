#!/bin/sh

# Crear cron job
# echo "00 11 * * * /app/run-reports.sh >> /proc/1/fd/1 2>&1" > /etc/crontabs/root
echo "30 10,13,17 * * * /app/run-reports.sh >> /proc/1/fd/1 2>&1" > /etc/crontabs/root

echo "Cron configurado para ejecutarse durante el dia en 3 diferentes horarios"
echo "Esperando ejecución programada..."

# Iniciar cron en segundo plano
exec crond -f -l 2
