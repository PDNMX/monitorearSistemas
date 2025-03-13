const fs = require("fs");
const path = require("path");
const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();

// Cargar el mapeo de proveedores desde el archivo JSON
const providersMapping = require("./utils/providers_catalog.json");

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
      "FECHA_EJECUCION,HORA_EJECUCION,ENTE_PUBLICO,TOTAL_REGISTROS,ESTATUS\n"
    );
  }
  fs.appendFileSync(filePath, data);
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
      console.log(`🔍 Consultando datos para proveedor: ${supplierId} (${supplierName})`);

      try {
        const searchResponse = await axios.post(CONFIG.searchUrl, { supplier_id: supplierId }, {
          headers: { "Content-Type": "application/json" },
        });

        const totalRows = searchResponse.data.pagination?.totalRows || "0";
        const csvLine = [date, time, formatCSVField(supplierName), totalRows, "Disponible"].join(",") + "\n";
        appendToCSV(detailsFilePath, csvLine);

        console.log(`✅ ${supplierName}: ${totalRows} filas encontradas.`);
      } catch (error) {
        console.error(`❌ Error al consultar ${supplierName}:`, error.message);
        appendToCSV(detailsFilePath, [date, time, formatCSVField(supplierName), "ERROR", error.message].join(",") + "\n");
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    console.log("Proceso completado. Datos guardados en:", detailsFilePath);
  } catch (error) {
    console.error("Error general en el script:", error.message);
  }
}

main();