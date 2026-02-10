#!/bin/sh

echo "=== Iniciando reportes $(date) ==="

echo "--- Ejecutando s1-report ---"
yarn s1-report
echo "s1-report finalizado con código: $?"

echo "--- Ejecutando s2-report ---"
yarn s2-report
echo "s2-report finalizado con código: $?"

echo "--- Ejecutando s3-report ---"
yarn s3-report
echo "s3-report finalizado con código: $?"

echo "=== Reportes completados $(date) ==="