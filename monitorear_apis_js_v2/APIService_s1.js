const axios = require("axios");
const https = require("https");
const qs = require("qs");
const log4js = require("log4js");
const fs = require("fs");
const path = require("path");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;

class APIService {
  constructor(credentialsPath, outputPath) {
    this.credentialsPath = credentialsPath;
    this.outputPath = outputPath;
    this.logger = log4js.getLogger("numeralia");
    this.logger.level = "all";
    this.apiClient = axios.create({
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      timeout: 5000,
    });
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
      this.logger.warn(`No token URL for ${supplier_name} (${supplier_id})`);
      return null;
    }

    try {
      const response = await this.apiClient.post(
        token_url,
        decodeURI(
          qs.stringify({
            grant_type: "password",
            username,
            password,
            client_id,
            client_secret,
            ...(scope && { scope }),
          })
        ),
        {
          auth: { username: client_id, password: client_secret },
          responseType: "json",
          json: true,
        }
      );
      return response;
    } catch (error) {
      this.logger.error(
        `Token error for ${supplier_name} (${supplier_id}):`,
        error.message
      );
      return { error: error.message };
    }
  }

  async fetchData(endpoint) {
    const { supplier_id, supplier_name, url } = endpoint;

    if (!url) {
      return {
        supplier_name,
        supplier_id,
        total_records: "No disponible",
        status: "URL no proporcionada",
        fecha_ejecucion: new Date().toISOString(),
      };
    }

    try {
      const tokenResponse = await this.getToken(endpoint);

      if (!tokenResponse || tokenResponse.error) {
        return {
          supplier_name,
          supplier_id,
          total_records: "No disponible",
          status: tokenResponse?.error || "Error de autenticación",
          fecha_ejecucion: new Date().toISOString(),
        };
      }

      const response = await this.apiClient({
        url: url,
        method: "post",
        headers: {
          "Content-Type": "application/json;charset=UTF-8",
          Authorization: `Bearer ${tokenResponse.data.access_token}`,
        },
        data: { page: 1, pageSize: 1 },
        json: true,
      });

      return {
        supplier_name,
        supplier_id,
        total_records: response.data.pagination?.totalRows ?? "No disponible",
        status: "Success",
        fecha_ejecucion: new Date().toISOString(),
      };
    } catch (error) {
      return {
        supplier_name,
        supplier_id,
        total_records: "No disponible",
        status: error.message,
        fecha_ejecucion: new Date().toISOString(),
      };
    }
  }

  async processBatch(endpoints, batchSize = 5) {
    const results = [];
    for (let i = 0; i < endpoints.length; i += batchSize) {
      const batch = endpoints.slice(i, i + batchSize);
      console.log(
        `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
          endpoints.length / batchSize
        )}`
      );

      const batchResults = await Promise.all(
        batch.map((endpoint) => this.fetchData(endpoint))
      );
      results.push(...batchResults);
    }
    return results;
  }

  async checkEndpoints() {
    try {
      console.log(`Reading endpoints from ${this.credentialsPath}`);
      const endpointsData = JSON.parse(
        fs.readFileSync(this.credentialsPath, "utf8")
      );

      const validEndpoints = endpointsData.filter(
        (endpoint) => endpoint.url || endpoint.entities_url
      );

      if (validEndpoints.length === 0) {
        this.logger.warn("No valid endpoints found");
        return;
      }

      console.log(`Found ${validEndpoints.length} valid endpoints`);
      const results = await this.processBatch(validEndpoints);

      // Ensure output directory exists
      const outputDir = path.dirname(this.outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const csvWriter = createCsvWriter({
        path: this.outputPath,
        header: [
          { id: "supplier_name", title: "PROVEEDOR" },
          { id: "supplier_id", title: "ID" },
          { id: "total_records", title: "TOTAL_REGISTROS" },
          { id: "status", title: "STATUS" },
          { id: "fecha_ejecucion", title: "FECHA_EJECUCION" },
        ],
      });

      await csvWriter.writeRecords(results);
      console.log(`Results written to ${this.outputPath}`);
    } catch (error) {
      this.logger.error("Error processing endpoints:", error.message);
      throw error;
    }
  }
}

// Uso
const service = new APIService(
  "../EndPointsAPIS/EndPoints_s1/endpointsS1.json",
  "./resultados/resultados.csv"
);

service
  .checkEndpoints()
  .then(() => console.log("Proceso completado"))
  .catch((error) => console.error("Error en el proceso:", error));
