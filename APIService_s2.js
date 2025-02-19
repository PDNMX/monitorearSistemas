const axios = require("axios");
const https = require("https");
const qs = require("qs");
const log4js = require("log4js");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

// Configurar logging
const logger = log4js.getLogger("numeralia");
logger.level = "all";

// Crear instancia de axios con configuración personalizada
const apiClient = axios.create({
  httpsAgent: new https.Agent({
    rejectUnauthorized: false,
  }),
});

// Cliente específico para Puebla
const pueblaClient = axios.create({
  timeout: 30000,
  headers: {
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
    Priority: "u=0",
    TE: "trailers",
  },
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

async function fetchPueblaData() {
  try {
    logger.info("Iniciando consulta a Puebla...");
    const response = await pueblaClient.post(
      "https://api.plataformadigitalnacional.org/s2/api/v1/search",
      {
        page: 1,
        pageSize: 10,
        supplier_id: "PUEBLA",
      }
    );

    // Verificar específicamente el campo totalRows en pagination
    if (response.data?.pagination?.totalRows !== undefined) {
      const totalRegistros = response.data.pagination.totalRows;
      logger.info(
        `Consulta a Puebla exitosa. Total de registros: ${totalRegistros}`
      );
      return {
        success: true,
        data: {
          pagination: {
            total: totalRegistros,
          },
        },
      };
    } else {
      const error = new Error(
        "Respuesta de Puebla sin datos de totalRows en pagination"
      );
      error.responseData = response.data;
      throw error;
    }
  } catch (error) {
    logger.error("Error detallado en consulta a Puebla:", {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      config: {
        url: error.config?.url,
        method: error.config?.method,
        headers: error.config?.headers,
      },
    });

    return {
      success: false,
      error: {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
      },
    };
  }
}

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
        "Fecha,Proveedor,ID,Total_Registros,Error\n"
      );
    }
  }

  async saveResult(data) {
    const { supplier_name, supplier_id, total_records, error } = data;
    const timestamp = getFormattedDate();

    // Crear línea CSV incluyendo información de error si existe
    const csvLine = `"${timestamp}","${supplier_name}","${supplier_id}","${total_records}"${
      error ? `,"${error.message.replace(/"/g, '""')}"` : ""
    }\n`;

    try {
      await fs.promises.appendFile(this.resultsFile, csvLine);

      if (total_records !== "No disponible" && !error) {
        const numericTotal =
          parseInt(String(total_records).replace(/[^\d]/g, "")) || 0;
        this.totalRecords += numericTotal;
      }

      console.log(`
        Proveedor: ${supplier_name}
        ID: ${supplier_id}
        Total de registros: ${total_records}
        ${error ? `Error: ${error.message}` : ""}
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

    try {
      if (supplier_id === "PUEBLA") {
        const pueblaResult = await fetchPueblaData();

        if (pueblaResult.success) {
          await this.saveResult({
            supplier_name:
              "Secretaría Ejecutiva del Sistema Estatal Anticorrupción del Estado de Puebla",
            supplier_id: "PUEBLA",
            total_records: pueblaResult.data.pagination.total.toLocaleString(),
          });
        } else {
          await this.saveResult({
            supplier_name:
              "Secretaría Ejecutiva del Sistema Estatal Anticorrupción del Estado de Puebla",
            supplier_id: "PUEBLA",
            total_records: "No disponible",
            error: pueblaResult.error,
          });
        }
        return;
      }

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

      if (!url) {
        logger.warn(
          `No main URL provided for ${supplier_name} (${supplier_id})`
        );
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
        error: {
          message: error.message,
          status: error.response?.status,
          data: error.response?.data,
        },
      });
    }
  }

  async checkEndpoints() {
    try {
      const startTimestamp = getFormattedDate();
      logger.info(`=== EJECUCIÓN INICIADA: ${startTimestamp} ===`);

      const endpointsData = JSON.parse(
        fs.readFileSync(
          path.join(__dirname, process.env.ruta_endpoints_s2),
          "utf8"
        )
      );

      // Agregar endpoint de Puebla
      const pueblaEndpoint = {
        supplier_id: "PUEBLA",
        supplier_name:
          "Secretaría Ejecutiva del Sistema Anticorrupción del Estado de Puebla",
        type: "SPECIAL",
      };

      const allEndpoints = [pueblaEndpoint, ...endpointsData];
      const validEndpoints = allEndpoints.filter(
        (endpoint) =>
          endpoint.url || endpoint.entities_url || endpoint.type === "SPECIAL"
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
