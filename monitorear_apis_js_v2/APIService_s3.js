const axios = require("axios");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const moment = require("moment");
const path = require("path");

const COLLECTIONS = {
  FALTAS_GRAVES_PERSONAS_MORALES: "faltas_graves_personas_morales",
  FALTAS_GRAVES_PERSONAS_FISICAS: "faltas_graves_personas_fisicas",
  FALTAS_ADMINISTRATIVAS_GRAVES: "faltas_administrativas_graves",
  FALTAS_ADMINISTRATIVAS_NO_GRAVES: "faltas_administrativas_no_graves",
};

const OUTPUT_DIR = "./resultados_s3";

async function fetchProviders() {
  try {
    const response = await axios.get(
      "https://api.plataformadigitalnacional.org/s3-wrapper/api/v1/providers"
    );
    return response.data.data;
  } catch (error) {
    console.error("Error obteniendo providers:", error.message);
    return [];
  }
}

async function getFaltasData(providerId, endpoint) {
  try {
    const response = await axios.get(
      `https://api.plataformadigitalnacional.org/s3-wrapper/api/v1/${endpoint}/${providerId}?page=1&limit=50`
    );

    return {
      fecha_ejecucion: moment().format("YYYY-MM-DD HH:mm:ss"),
      entidad: providerId,
      endpoint: endpoint,
      total_registros: response.data.pagination.totalItems || 0,
      status: "SUCCESS",
      error: "",
    };
  } catch (error) {
    return {
      fecha_ejecucion: moment().format("YYYY-MM-DD HH:mm:ss"),
      entidad: providerId,
      endpoint: endpoint,
      total_registros: 0,
      status: "ERROR",
      error: error.message,
    };
  }
}

async function createDetailCsvWriter(endpoint) {
  return createCsvWriter({
    path: path.join(OUTPUT_DIR, `resultados_${endpoint}.csv`),
    header: [
      { id: "fecha_ejecucion", title: "FECHA_EJECUCION" },
      { id: "entidad", title: "ENTIDAD" },
      { id: "endpoint", title: "ENDPOINT" },
      { id: "total_registros", title: "TOTAL_REGISTROS" },
      { id: "status", title: "STATUS" },
      { id: "error", title: "ERROR" },
    ],
  });
}

async function createSummaryCsvWriter() {
  return createCsvWriter({
    path: path.join(OUTPUT_DIR, "resumen_consultas.csv"),
    header: [
      { id: "fecha_ejecucion", title: "FECHA_EJECUCION" },
      { id: "endpoint", title: "ENDPOINT" },
      { id: "total_registros", title: "TOTAL_REGISTROS" },
    ],
  });
}

async function main() {
  const providers = await fetchProviders();
  const allResults = {};
  const summaryResults = [];

  // Inicializar resultados para cada endpoint
  for (const endpoint of Object.values(COLLECTIONS)) {
    allResults[endpoint] = [];
  }

  // Obtener datos para cada provider y endpoint
  for (const provider of providers) {
    console.log(`Procesando ${provider.id}...`);

    for (const endpoint of Object.values(COLLECTIONS)) {
      console.log(`Consultando endpoint ${endpoint}...`);
      const result = await getFaltasData(provider.id, endpoint);
      allResults[endpoint].push(result);
    }
  }

  // Escribir archivos individuales para cada endpoint
  for (const [endpoint, results] of Object.entries(allResults)) {
    const csvWriter = await createDetailCsvWriter(endpoint);
    await csvWriter.writeRecords(results);
    console.log(`Resultados guardados para ${endpoint}`);

    // Calcular suma total para el resumen
    const totalRegistros = results.reduce(
      (sum, record) => sum + record.total_registros,
      0
    );
    summaryResults.push({
      fecha_ejecucion: moment().format("YYYY-MM-DD HH:mm:ss"),
      endpoint: endpoint,
      total_registros: totalRegistros,
    });
  }

  // Escribir archivo de resumen
  const summaryCsvWriter = await createSummaryCsvWriter();
  await summaryCsvWriter.writeRecords(summaryResults);
  console.log("Resumen guardado en resumen_consultas.csv");
}

main().catch(console.error);
