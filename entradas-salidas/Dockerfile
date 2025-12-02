# 1. Imagen base
FROM node:18-slim

# 2. Directorio de trabajo
WORKDIR /app

# 3. Copiar package.json antes para aprovechar cache
COPY package*.json ./

# 4. Instalar dependencias
RUN npm install --production

# 5. Copiar todo el proyecto
COPY . .

# 6. Construir Next.js
RUN npm run build

# 7. Exponer puerto Cloud Run
ENV PORT=8080
EXPOSE 8080

# 8. Iniciar con server.js
CMD ["node", "server.js"]
