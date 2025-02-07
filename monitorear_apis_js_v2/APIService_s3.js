const axios = require("axios");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const moment = require("moment");

const OUTPUT_FILE = "./resultados_s3/resultados_faltas_graves.csv";

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

async function getFaltasAdministrativas(providerId) {
  try {
    const response = await axios.get(
      `https://api.plataformadigitalnacional.org/s3-wrapper/api/v1/faltas_administrativas_graves/${providerId}?page=1&limit=50`
    );

    return {
      fecha_ejecucion: moment().format("YYYY-MM-DD HH:mm:ss"),
      entidad: providerId,
      total_registros: response.data.pagination.totalItems || 0,
      status: "SUCCESS",
      error: "",
    };
  } catch (error) {
    return {
      fecha_ejecucion: moment().format("YYYY-MM-DD HH:mm:ss"),
      entidad: providerId,
      total_registros: 0,
      status: "ERROR",
      error: error.message,
    };
  }
}

async function main() {
  const csvWriter = createCsvWriter({
    path: OUTPUT_FILE,
    header: [
      { id: "fecha_ejecucion", title: "FECHA_EJECUCION" },
      { id: "entidad", title: "ENTIDAD" },
      { id: "total_registros", title: "TOTAL_REGISTROS" },
      { id: "status", title: "STATUS" },
      { id: "error", title: "ERROR" },
    ],
  });

  const providers = await fetchProviders();
  const results = [];

  for (const provider of providers) {
    console.log(`Procesando ${provider.id}...`);
    const result = await getFaltasAdministrativas(provider.id);
    results.push(result);
  }

  await csvWriter.writeRecords(results);
  console.log(`Resultados guardados en ${OUTPUT_FILE}`);
}

main().catch(console.error);
