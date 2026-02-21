FROM node:20

WORKDIR /app

COPY package.json tsconfig.json ./
COPY prisma ./prisma
COPY src ./src

RUN npm install
RUN npx prisma generate

EXPOSE 4000

CMD ["npm", "run", "dev"]

