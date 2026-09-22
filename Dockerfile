FROM node:20-alpine

WORKDIR /app

# Install all deps (including dev, because we build the frontend in the image)
COPY package.json ./
RUN npm install

COPY . .

# Build the Vue app -> dist/
RUN npm run build

EXPOSE 3000
CMD ["node", "server/index.js"]
