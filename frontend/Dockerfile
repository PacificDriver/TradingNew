FROM node:20-alpine

WORKDIR /app

ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
ARG NEXT_PUBLIC_WS_URL=ws://localhost:4000
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL

COPY package.json tsconfig.json next.config.mjs tailwind.config.ts postcss.config.mjs next-env.d.ts ./
COPY app ./app
COPY components ./components
COPY store ./store
COPY lib ./lib

RUN npm install
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]

