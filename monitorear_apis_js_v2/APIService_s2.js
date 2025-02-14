const axios = require("axios");
const https = require("https");
const qs = require("qs");
const log4js = require("log4js");
const fs = require("fs");
const path = require("path");

// Configurar logging
const logger = log4js.getLogger("numeralia");
logger.level = "all";

// Crear instancia de axios con configuración personalizada
const apiClient = axios.create({
  httpsAgent: new https.Agent({
    rejectUnauthorized: false,
  }),
});

// Función helper para obtener timestamp formateado
const getFormattedDate = () => {
  const date = new Date();
  return date.toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

// Función helper para obtener fecha formateada para nombre de archivo
const getFileDate = () => {
  const date = new Date();
  return date.toISOString().split("T")[0].replace(/-/g, "");
};

class APIService {
  constructor() {
    // Crear directorio de resultados si no existe
    this.resultsDir = path.join(__dirname, "resultados_s2");
    if (!fs.existsSync(this.resultsDir)) {
      fs.mkdirSync(this.resultsDir, { recursive: true });
    }

    // Inicializar archivos de resultados
    this.resultsFile = path.join(
      this.resultsDir,
      `resultados_s2_${getFileDate()}.csv`
    );
    this.totalFile = path.join(this.resultsDir, "total_registros.csv");

    // Inicializar contador de registros totales
    this.totalRecords = 0;

    this.initializeResultsFile();
  }

  initializeResultsFile() {
    // Crear archivo con encabezados si no existe
    if (!fs.existsSync(this.resultsFile)) {
      fs.writeFileSync(
        this.resultsFile,
        "Fecha,Proveedor,ID,Total_Registros\n"
      );
    }
  }

  async saveResult(data) {
    const { supplier_name, supplier_id, total_records } = data;
    const timestamp = getFormattedDate();

    // Crear línea CSV
    const csvLine = `"${timestamp}","${supplier_name}","${supplier_id}","${total_records}"\n`;

    try {
      await fs.promises.appendFile(this.resultsFile, csvLine);

      if (total_records !== "No disponible") {
        const numericTotal =
          parseInt(String(total_records).replace(/[^\d]/g, "")) || 0;
        this.totalRecords += numericTotal;
      }

      console.log(`
        Proveedor: ${supplier_name}
        ID: ${supplier_id}
        Total de registros: ${total_records}
        -------------------------------------------`);
    } catch (error) {
      logger.error(`Error guardando en archivo: ${error.message}`);
    }
  }

  async saveTotalRecords() {
    const timestamp = getFormattedDate();
    const totalLine = `"${timestamp}","${this.totalRecords.toLocaleString()}"\n`;

    try {
      // Crear archivo con encabezados si no existe
      if (!fs.existsSync(this.totalFile)) {
        await fs.promises.writeFile(this.totalFile, "Fecha,Total_Registros\n");
      }

      await fs.promises.appendFile(this.totalFile, totalLine);
      logger.info(
        `Total de registros guardado: ${this.totalRecords.toLocaleString()}`
      );

      // Mostrar el total en consola
      console.log(
        `\nTotal de registros: ${this.totalRecords.toLocaleString()}`
      );
      console.log(`Fecha de ejecución: ${timestamp}`);
    } catch (error) {
      logger.error(`Error guardando total de registros: ${error.message}`);
    }
  }

  async getToken(endpoint) {
    const {
      supplier_id,
      supplier_name,
      token_url,
      username,
      password,
      client_id,
      client_secret,
      scope,
    } = endpoint;

    if (!token_url) {
      logger.warn(
        `No token URL provided for ${supplier_name} (${supplier_id})`
      );
      return null;
    }

    const data = {
      grant_type: "password",
      username,
      password,
      client_id,
      client_secret,
      ...(scope && { scope }),
    };

    const opts = {
      auth: {
        username: client_id,
        password: client_secret,
      },
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    };

    try {
      const response = await apiClient.post(
        token_url,
        decodeURI(qs.stringify(data)),
        opts
      );
      return response;
    } catch (error) {
      logger.error(
        `Error getting token for ${supplier_name} (${supplier_id}):`,
        error.message
      );
      return { error: error.message };
    }
  }

  async fetchSFPData() {
    try {
      const response = await axios.get(
        "https://internal-apis.funcionpublica.gob.mx/pdn/reniresp/"
      );
      return response.data;
    } catch (error) {
      logger.error("Error fetching SFP data:", error.message);
      throw error;
    }
  }

  async fetchData(endpoint) {
    const { supplier_id, supplier_name, url, type } = endpoint;

    if (!url) {
      logger.warn(`No main URL provided for ${supplier_name} (${supplier_id})`);
      return;
    }

    try {
      // Manejar SFP de manera diferente
      if (type === "GRAPHQL" && supplier_id === "SFP") {
        const sfpData = await this.fetchSFPData();
        await this.saveResult({
          supplier_name,
          supplier_id,
          total_records: sfpData.total || "No disponible",
        });
        return;
      }

      const tokenResponse = await this.getToken(endpoint);

      if (!tokenResponse || tokenResponse.error) {
        await this.saveResult({
          supplier_name,
          supplier_id,
          total_records: "No disponible",
        });
        return;
      }

      const { access_token } = tokenResponse.data;
      const response = await apiClient({
        url: url,
        method: "post",
        headers: {
          "Content-Type": "application/json;charset=UTF-8",
          Authorization: `Bearer ${access_token}`,
        },
        data: {
          page: 1,
          pageSize: 1,
        },
      });

      const { pagination } = response.data;
      const totalRows = pagination?.totalRows;

      await this.saveResult({
        supplier_name,
        supplier_id,
        total_records:
          typeof totalRows === "number"
            ? totalRows.toLocaleString()
            : totalRows ?? "No disponible",
      });
    } catch (error) {
      logger.error(
        `Error fetching data for ${supplier_name} (${supplier_id}):`,
        error.message
      );
      await this.saveResult({
        supplier_name,
        supplier_id,
        total_records: "No disponible",
      });
    }
  }

  async checkEndpoints() {
    try {
      const startTimestamp = getFormattedDate();
      logger.info(`=== EJECUCIÓN INICIADA: ${startTimestamp} ===`);

      const endpointsData = JSON.parse(
        fs.readFileSync(
          path.join(
            __dirname,
            "../EndPointsAPIS/EndPoints_s2/endpointsS2.json"
          ),
          "utf8"
        )
      );

      const validEndpoints = endpointsData.filter(
        (endpoint) => endpoint.url || endpoint.entities_url
      );

      if (validEndpoints.length === 0) {
        logger.warn("No valid endpoints found with required URLs");
        return;
      }

      console.log(`Processing ${validEndpoints.length} endpoints...\n`);

      // Procesar endpoints secuencialmente para evitar problemas de concurrencia
      for (const endpoint of validEndpoints) {
        await this.fetchData(endpoint);
      }

      // Guardar y mostrar el total de registros
      await this.saveTotalRecords();

      const endTimestamp = getFormattedDate();
      logger.info(`=== EJECUCIÓN FINALIZADA: ${endTimestamp} ===`);
      console.log(`\nResultados guardados en: ${this.resultsFile}`);
      console.log(`Total de registros guardado en: ${this.totalFile}`);
    } catch (error) {
      logger.error(
        "Error reading or processing endpoints.json:",
        error.message
      );
    }
  }
}

// Ejecutar el script
async function main() {
  try {
    const apiService = new APIService();
    await apiService.checkEndpoints();
  } catch (error) {
    console.error("Error ejecutando script:", error);
  }
}

main();
