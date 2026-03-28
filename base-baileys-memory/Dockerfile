FROM node:18-alpine as bot

# Instalar dependencias del sistema necesarias para Baileys
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev

WORKDIR /app

# Copiar archivos de dependencias primero para mejor cache
COPY package*.json ./

# Instalar dependencias
RUN npm ci --only=production

# Copiar el resto del código
COPY . .

# Variables de entorno
ARG RAILWAY_STATIC_URL
ARG PUBLIC_URL
ARG PORT=3000
ENV PORT=$PORT

# Exponer puerto
EXPOSE $PORT

# Comando de inicio
CMD ["npm", "start"]
