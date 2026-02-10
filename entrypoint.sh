#!/bin/sh

cat > /app/run-reports.sh << 'EOF'
#!/bin/sh

cd /app

echo "=== Iniciando reportes $(date) ==="
echo "--- Ejecutando s1-report ---"
yarn s1-report
echo "s1-report finalizado con código: $?"
echo ""
echo "--- Ejecutando s2-report ---"
yarn s2-report
echo "s2-report finalizado con código: $?"
echo ""
echo "--- Ejecutando s3-report ---"
yarn s3-report
echo "s3-report finalizado con código: $?"
echo "=== Reportes completados $(date) ==="
EOF

chmod +x /app/run-reports.sh

# Crear cron job
echo "00 11 * * * /app/run-reports.sh >> /var/log/cron.log 2>&1" > /etc/crontabs/root

touch /var/log/cron.log

# Iniciar cron en segundo plano
crond -b -l 2

echo "Cron configurado para ejecutarse a las 11:00 AM CDMX"
echo "Esperando ejecución programada..."

tail -f /var/log/cron.log