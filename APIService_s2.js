const fs = require("fs");
const path = require("path");
const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();
// Configuración
const CONFIG = {
  // Ruta donde se guardará el archivo
  outputPath: process.env.salida_s2,
  // Nombre del archivo CSV
  csvFileName: "s2_procedimientos.csv",
  // URL de la API
  summaryUrl: process.env.url_busqueda_s2,
};

// Función para asegurar que exista el directorio
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`Directorio creado: ${dirPath}`);
  }
}

// Función para obtener la fecha y hora actual en formato YYYY-MM-DD HH:MM
function getCurrentDateTime() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
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
      "FECHA_EJECUCION,ENTE_PUBLICO,TOTAL_REGISTROS,ESTATUS\n"
    );
  }

  // Agregar datos
  fs.appendFileSync(filePath, data);
  console.log(`Datos agregados al archivo: ${filePath}`);
}

// Función principal
async function main() {
  const currentDateTime = getCurrentDateTime();

  try {
    // Verificar si las variables de entorno existen
    if (!process.env.salida_s2) {
      throw new Error("La variable de entorno 'salida_s2' no está definida");
    }

    if (!process.env.url_busqueda_s2) {
      throw new Error(
        "La variable de entorno 'url_busqueda_s2' no está definida"
      );
    }

    // Asegurar que existe el directorio
    ensureDirectoryExists(CONFIG.outputPath);

    // Ruta completa al archivo CSV
    const csvFilePath = path.join(CONFIG.outputPath, CONFIG.csvFileName);

    console.log("Consultando datos del resumen de S2...");

    // Configurar los headers
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64; rv:135.0) Gecko/20100101 Firefox/135.0",
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "gzip, deflate, br, zstd",
      "Content-Type": "application/json",
      Origin: "https://www.plataformadigitalnacional.org",
      Connection: "keep-alive",
      Referer: "https://www.plataformadigitalnacional.org/",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-site",
    };

    // Realizar la consulta
    const response = await axios.post(CONFIG.summaryUrl, {}, { headers });
    const summaryData = response.data;

    console.log(
      `Se encontraron ${summaryData.length} registros. Guardando en CSV...`
    );

    // Procesar cada registro y escribir en el CSV
    for (const item of summaryData) {
      const supplierId = item.supplier_id || "";
      let totalRows = "";
      let status = "Disponible"; // Por defecto asumimos que está disponible

      // Verificar si item.error es true o si hay algún problema con totalRows
      if (item.error === true) {
        totalRows = "ERROR";
        status = "No disponible/Error reportado por la API";
      } else {
        // Verificar si totalRows existe y es un número
        if (item.totalRows !== undefined) {
          if (typeof item.totalRows === "number" && !isNaN(item.totalRows)) {
            totalRows = item.totalRows;
            // Incluso si totalRows es 0, consideramos que está disponible según los nuevos requisitos
          } else {
            totalRows = "ERROR";
            status = `No disponible/El valor de totalRows no es un número: ${item.totalRows}`;
          }
        } else {
          totalRows = 0;
          status = "No disponible/El campo totalRows no existe en la respuesta";
        }
      }

      // Crear línea para CSV usando nuestra función de formateo
      const csvLine =
        [
          formatCSVField(currentDateTime),
          formatCSVField(supplierId),
          formatCSVField(totalRows),
          formatCSVField(status),
        ].join(",") + "\n";

      // Agregar al archivo CSV
      appendToCSV(csvFilePath, csvLine);
    }

    console.log(`\nProceso completado.`);
    console.log(`Datos guardados en: ${csvFilePath}`);
  } catch (error) {
    console.error("Error en el script:", error.message);

    try {
      // Asegurar que podemos escribir el error incluso si hay problemas con las variables de entorno
      const outputPath = CONFIG.outputPath || "./output";
      ensureDirectoryExists(outputPath);

      // Ruta completa al archivo CSV para registrar el error general
      const csvFilePath = path.join(outputPath, CONFIG.csvFileName);

      // Preparar mensaje de error para el CSV
      let errorMessage = error.message;

      // Agregar detalles adicionales si están disponibles
      if (error.response) {
        const responseInfo = `${error.response.status} ${error.response.statusText}`;
        errorMessage += ` (${responseInfo})`;
      }

      // Escribir el error general en el CSV utilizando nuestra función de formateo
      const csvLine =
        [
          formatCSVField(currentDateTime),
          formatCSVField("ERROR_GENERAL"),
          formatCSVField("ERROR"),
          formatCSVField(`No disponible/${errorMessage}`),
        ].join(",") + "\n";

      appendToCSV(csvFilePath, csvLine);
      console.error("Error registrado en el archivo CSV.");
    } catch (fileError) {
      console.error(
        "No se pudo registrar el error en el archivo CSV:",
        fileError.message
      );
    }
  }
}

// Ejecutar el script
main();
