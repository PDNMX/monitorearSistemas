const APIService = require("./APIService");

const service = new APIService(
  "../EndPointsAPIS/EndPoints_s3/endpointsS3P.json", // Ruta del archivo de credenciales
  "./resultados_s2/resultados.csv" // Ruta donde se guardará el CSV
);

service.checkEndpoints();
