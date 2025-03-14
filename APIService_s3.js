const axios = require("axios");
const fs = require("fs");
const path = require("path");
const moment = require("moment");
const dotenv = require("dotenv");

dotenv.config();

const providersMapping = require("./utils/providers_catalog.json");

const COLLECTIONS = {
  FALTAS_GRAVES_PERSONAS_MORALES: "faltas_graves_personas_morales",
  FALTAS_GRAVES_PERSONAS_FISICAS: "faltas_graves_personas_fisicas",
  FALTAS_ADMINISTRATIVAS_GRAVES: "faltas_administrativas_graves",
  FALTAS_ADMINISTRATIVAS_NO_GRAVES: "faltas_administrativas_no_graves",
};

const OUTPUT_DIR = process.env.salida_s3;

// Función para asegurar que exista el directorio
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`Directorio creado: ${dirPath}`);
  }
}

// Función para obtener la fecha actual en formato YYYY-MM-DD
function getCurrentDate() {
  return moment().format("YYYY-MM-DD");
}

// Función para obtener la hora actual en formato HH:MM:SS
function getCurrentTime() {
  return moment().format("HH:mm:ss");
}

// Función para formatear correctamente un campo CSV
function formatCSVField(value) {
  if (value === null || value === undefined) {
    return "";
  }

  // Convertir a string si no lo es ya
  const strValue = String(value);

  // Si contiene comillas, comas o saltos de línea, escapar las comillas y encerrar en comillas
  if (
    strValue.includes('"') ||
    strValue.includes(",") ||
    strValue.includes("\n")
  ) {
    return `"${strValue.replace(/"/g, '""')}"`;
  }

  return strValue;
}

// Función para escribir en el archivo CSV
function appendToCSV(filePath, data) {
  const fileExists = fs.existsSync(filePath);

  // Si el archivo no existe, crear con encabezados
  if (!fileExists) {
    fs.writeFileSync(
      filePath,
      "FECHA_EJECUCION,HORA_EJECUCION,ENTE,TOTAL_REGISTROS,ESTATUS\n"
    );
  }

  // Agregar datos
  fs.appendFileSync(filePath, data);
}

// Función para escribir el resumen en el archivo CSV
function appendToSummaryCSV(filePath, data) {
  const fileExists = fs.existsSync(filePath);

  // Si el archivo no existe, crear con encabezados
  if (!fileExists) {
    fs.writeFileSync(
      filePath,
      "FECHA_EJECUCION,HORA_EJECUCION,ENDPOINT,TOTAL_REGISTROS\n"
    );
  }

  // Agregar datos
  fs.appendFileSync(filePath, data);
}

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
    const providerName = providersMapping[providerId] || providerId;
    return {
      fecha_ejecucion: getCurrentDate(),
      hora_ejecucion: getCurrentTime(),
      ente_publico: providerName,
      total_registros: response.data.pagination.totalItems || 0,
      estatus: "Disponible",
      _endpoint: endpoint,
    };
  } catch (error) {
    const providerName = providersMapping[providerId] || providerId;
    return {
      fecha_ejecucion: getCurrentDate(),
      hora_ejecucion: getCurrentTime(),
      ente_publico: providerName,
      total_registros: 0,
      estatus: `No disponible/${error.message}`,
      _endpoint: endpoint,
    };
  }
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
    ensureDirectoryExists(OUTPUT_DIR);

    const providers = await fetchProviders();
    const allResults = {};
    const summaryResults = {};

    // Inicializar resultados para cada endpoint
    for (const endpoint of Object.values(COLLECTIONS)) {
      allResults[endpoint] = [];
      summaryResults[endpoint] = 0;
    }

    // Obtener datos para cada provider y endpoint
    for (const provider of providers) {
      console.log(`Procesando ${provider.id}...`);

      for (const endpoint of Object.values(COLLECTIONS)) {
        console.log(`Consultando endpoint ${endpoint}...`);
        const result = await getFaltasData(provider.id, endpoint);
        allResults[endpoint].push(result);

        // Sumar al total para el resumen
        summaryResults[endpoint] += result.total_registros;
      }
    }

    // Escribir archivos individuales para cada endpoint (append mode)
    for (const [endpoint, results] of Object.entries(allResults)) {
      const filePath = path.join(OUTPUT_DIR, `s3_${endpoint}.csv`);

      for (const result of results) {
        // Crear línea para CSV usando nuestra función de formateo
        const csvLine =
          [
            formatCSVField(result.fecha_ejecucion),
            formatCSVField(result.hora_ejecucion),
            formatCSVField(result.ente_publico),
            formatCSVField(result.total_registros),
            formatCSVField(result.estatus),
          ].join(",") + "\n";

        // Agregar al archivo CSV
        appendToCSV(filePath, csvLine);
      }

      console.log(`Resultados guardados para ${endpoint}`);
    }

    // Escribir archivo de resumen (append mode)
    const summaryFilePath = path.join(OUTPUT_DIR, "resumen_s3_consultas.csv");
    const currentDate = getCurrentDate();
    const currentTime = getCurrentTime();

    for (const [endpoint, totalRegistros] of Object.entries(summaryResults)) {
      // Crear línea para CSV de resumen
      const summaryLine =
        [
          formatCSVField(currentDate),
          formatCSVField(currentTime),
          formatCSVField(endpoint),
          formatCSVField(totalRegistros),
        ].join(",") + "\n";

      // Agregar al archivo CSV de resumen
      appendToSummaryCSV(summaryFilePath, summaryLine);
    }

    console.log(`Resumen guardado en resumen_s3_consultas.csv`);
  } catch (error) {
    console.error("Error general en el script:", error.message);

    try {
      // Intentar registrar el error en un archivo especial
      const errorFilePath = path.join(OUTPUT_DIR || "./output", "error_s3.csv");

      // Crear directorio si no existe
      const outputDir = OUTPUT_DIR || "./output";
      ensureDirectoryExists(outputDir);

      // Registrar el error
      const errorLine =
        [
          formatCSVField(getCurrentDate()),
          formatCSVField(getCurrentTime()),
          formatCSVField("ERROR_GENERAL"),
          formatCSVField(0),
          formatCSVField(`No disponible/${error.message}`),
        ].join(",") + "\n";

      appendToCSV(errorFilePath, errorLine);

      console.log(`Error registrado en ${errorFilePath}`);
    } catch (fileError) {
      console.error("No se pudo registrar el error:", fileError.message);
    }
  }
}

main();
