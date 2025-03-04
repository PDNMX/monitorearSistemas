const axios = require("axios");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const moment = require("moment");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

const COLLECTIONS = {
  FALTAS_GRAVES_PERSONAS_MORALES: "faltas_graves_personas_morales",
  FALTAS_GRAVES_PERSONAS_FISICAS: "faltas_graves_personas_fisicas",
  FALTAS_ADMINISTRATIVAS_GRAVES: "faltas_administrativas_graves",
  FALTAS_ADMINISTRATIVAS_NO_GRAVES: "faltas_administrativas_no_graves",
};

const OUTPUT_DIR = process.env.salida_s3;

async function fetchProviders() {
  try {
    const response = await axios.get(process.env.url_proveedores_s3);
    return response.data.data;
  } catch (error) {
    console.error("Error obteniendo providers:", error.message);
    return [];
  }
}

async function getFaltasData(providerId, endpoint) {
  try {
    const response = await axios.get(
      process.env.url_busqueda_s3 + `${endpoint}/${providerId}?page=1&limit=50`
    );

    return {
      fecha_ejecucion: moment().format("YYYY-MM-DD HH:mm:ss"),
      ente_publico: providerId,
      total_registros: response.data.pagination.totalItems || 0,
      estatus: "Disponible",
      // Guardamos el endpoint solo para uso interno (no aparecerá en CSV)
      _endpoint: endpoint,
    };
  } catch (error) {
    return {
      fecha_ejecucion: moment().format("YYYY-MM-DD HH:mm:ss"),
      ente_publico: providerId,
      total_registros: 0,
      estatus: `No disponible/${error.message}`,
      // Guardamos el endpoint solo para uso interno (no aparecerá en CSV)
      _endpoint: endpoint,
    };
  }
}

async function createDetailCsvWriter(endpoint) {
  return createCsvWriter({
    path: path.join(OUTPUT_DIR, `s3_${endpoint}.csv`),
    header: [
      { id: "fecha_ejecucion", title: "FECHA_EJECUCION" },
      { id: "ente_publico", title: "ENTE_PUBLICO" },
      { id: "total_registros", title: "TOTAL_REGISTROS" },
      { id: "estatus", title: "ESTATUS" },
    ],
  });
}

async function createSummaryCsvWriter() {
  return createCsvWriter({
    path: path.join(OUTPUT_DIR, "resumen_s3_consultas.csv"),
    header: [
      { id: "fecha_ejecucion", title: "FECHA_EJECUCION" },
      { id: "endpoint", title: "ENDPOINT" },
      { id: "total_registros", title: "TOTAL_REGISTROS" },
    ],
  });
}

async function main() {
  try {
    // Verificar si las variables de entorno existen
    if (!process.env.salida_s3) {
      throw new Error("La variable de entorno 'salida_s3' no está definida");
    }

    if (!process.env.url_proveedores_s3) {
      throw new Error(
        "La variable de entorno 'url_proveedores_s3' no está definida"
      );
    }

    if (!process.env.url_busqueda_s3) {
      throw new Error(
        "La variable de entorno 'url_busqueda_s3' no está definida"
      );
    }

    // Asegurar que el directorio de salida existe
    const fs = require("fs");
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      console.log(`Directorio creado: ${OUTPUT_DIR}`);
    }

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
    console.log("Resumen guardado en resumen_s3_consultas.csv");
  } catch (error) {
    console.error("Error general en el script:", error.message);

    try {
      // Intentar registrar el error en un archivo especial
      const fs = require("fs");
      const errorFilePath = path.join(OUTPUT_DIR || "./output", "error_s3.csv");

      // Crear directorio si no existe
      const outputDir = OUTPUT_DIR || "./output";
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Crear el archivo de error si no existe
      if (!fs.existsSync(errorFilePath)) {
        fs.writeFileSync(
          errorFilePath,
          "FECHA_EJECUCION,ENTE_PUBLICO,TOTAL_REGISTROS,ESTATUS\n"
        );
      }

      // Registrar el error
      const errorLine = `${moment().format(
        "YYYY-MM-DD HH:mm:ss"
      )},"ERROR_GENERAL",0,"No disponible/${error.message}"\n`;
      fs.appendFileSync(errorFilePath, errorLine);

      console.log(`Error registrado en ${errorFilePath}`);
    } catch (fileError) {
      console.error("No se pudo registrar el error:", fileError.message);
    }
  }
}

main();
