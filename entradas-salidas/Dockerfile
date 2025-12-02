# Usa la imagen oficial de Node
FROM node:20-slim

# Directorio de trabajo
WORKDIR /app

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar todas las dependencias (incluyendo devDependencies)
RUN npm install

# Copiar el resto del proyecto
COPY . .

# Construir la app
RUN npm run build

# Exponer el puerto que usará Cloud Run
EXPOSE 8080
ENV PORT=8080

# Comando de inicio
CMD ["npm", "start"]
