# Imagen base
FROM node:20-slim

# Directorio de trabajo
WORKDIR /app

# Copiar package.json y lock
COPY package*.json ./

# Instalar dependencias
RUN npm install --production

# Copiar código
COPY . .

# Construir Next.js
RUN npm run build

# Exponer puerto
EXPOSE 8080
ENV PORT=8080

# Ejecutar Next.js
CMD ["npm", "start"]
