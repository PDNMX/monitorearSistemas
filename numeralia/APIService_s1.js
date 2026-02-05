const fs = require("fs");
const path = require("path");
const axios = require("axios");
const dotenv = require("dotenv");

/* dotenv.config({path: path.join(process.cwd(), '.env')}); */
dotenv.config();

// Cargar el mapeo de proveedores desde el archivo JSON
const providersMapping = require("../utils/providers_catalog.json");

const CONFIG = {
  outputPath: process.env.salida_s1,
  detailsFileName: "s1_declaraciones.csv",
  providersUrl: process.env.url_proveedores_s1,
  searchUrl: process.env.url_busqueda_s1,
};

function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`Directorio creado: ${dirPath}`);
  }
}

function getCurrentDateTime() {
  const now = new Date();
  return {
    date: now.toISOString().split("T")[0],
    time: now.toTimeString().split(" ")[0],
  };
}

function formatCSVField(value) {
  if (value === null || value === undefined) return "";
  const strValue = String(value);
  return strValue.includes(",") || strValue.includes("\n") ? `"${strValue.replace(/"/g, '""')}"` : strValue;
}

function appendToCSV(filePath, data) {
  const fileExists = fs.existsSync(filePath);
  if (!fileExists) {
    fs.writeFileSync(
      filePath,
      "FECHA_EJECUCION,HORA_EJECUCION,ENTE,TOTAL_REGISTROS,ESTATUS\n"
    );
  }
  fs.appendFileSync(filePath, data);
}

function extractErrorDetails(error) {
  let errorDetails = "Error desconocido";
  
  if (error.response) {
    // La solicitud se realizó y el servidor respondió con un código de estado
    // que cae fuera del rango 2xx
    if (error.response.data && error.response.data.error) {
      // Si el error viene en formato { error: { status, statusText, ... } }
      const { status, statusText } = error.response.data.error;
      errorDetails = `Estado: ${status}, Mensaje: ${statusText}`;
    } else if (typeof error.response.data === 'object') {
      // Si es otro formato de objeto de error
      errorDetails = JSON.stringify(error.response.data);
    } else {
      // Si es un error simple
      errorDetails = `Estado: ${error.response.status}, Mensaje: ${error.response.statusText}`;
    }
  } else if (error.request) {
    // La solicitud se realizó pero no se recibió respuesta
    errorDetails = "No se recibió respuesta del servidor";
  } else {
    // Ocurrió un error al configurar la solicitud
    errorDetails = error.message;
  }
  
  return formatCSVField(errorDetails);
}

async function main() {
  const { date, time } = getCurrentDateTime();
  ensureDirectoryExists(CONFIG.outputPath);
  const detailsFilePath = path.join(CONFIG.outputPath, CONFIG.detailsFileName);

  try {
    console.log("Obteniendo lista de proveedores...");
    const providersResponse = await axios.get(CONFIG.providersUrl);
    const providers = providersResponse.data;
    console.log(`Se encontraron ${providers.length} proveedores.`);

    for (const provider of providers) {
      const supplierId = provider.supplier_id;
      const supplierName = providersMapping[supplierId] || supplierId;
      console.log(`Consultando datos para proveedor: ${supplierId} (${supplierName})`);

      try {
        const searchResponse = await axios.post(CONFIG.searchUrl, { supplier_id: supplierId }, {
          headers: { "Content-Type": "application/json" },
        });

        // Verificar si hay errores en la respuesta
        if (searchResponse.data && searchResponse.data.error) {
          const errorDetails = typeof searchResponse.data.error === 'object' 
            ? JSON.stringify(searchResponse.data.error) 
            : searchResponse.data.error;
          
          console.error(`Error en la respuesta para ${supplierName}:`, errorDetails);
          appendToCSV(
            detailsFilePath, 
            [date, time, formatCSVField(supplierName), "0", "Error", formatCSVField(errorDetails)].join(",") + "\n"
          );
        } else {
          const totalRows = searchResponse.data.pagination?.totalRows || "0";
          const csvLine = [date, time, formatCSVField(supplierName), totalRows, "Disponible", ""].join(",") + "\n";
          appendToCSV(detailsFilePath, csvLine);
          console.log(`${supplierName}: ${totalRows} filas encontradas.`);
        }
      } catch (error) {
        const errorDetails = extractErrorDetails(error);
        console.error(`Error al consultar ${supplierName}:`, errorDetails);
        appendToCSV(
          detailsFilePath, 
          [date, time, formatCSVField(supplierName), "0", "Error", errorDetails].join(",") + "\n"
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    console.log("Proceso completado. Datos guardados en:", detailsFilePath);
  } catch (error) {
    console.error("Error general en el script:", error.message);
  }
}

main();