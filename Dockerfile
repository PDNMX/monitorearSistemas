FROM node:22-alpine

RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/America/Mexico_City /etc/localtime && \
    echo "America/Mexico_City" > /etc/timezone

WORKDIR /app
COPY package*.json yarn.lock ./

RUN yarn install --frozen-lockfile

COPY . .

RUN chmod +x /app/entrypoint.sh /app/run-reports.sh

ENTRYPOINT ["/app/entrypoint.sh"]