FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

# Start the server using ts-node
CMD ["npx", "ts-node", "src/index.ts"] 
