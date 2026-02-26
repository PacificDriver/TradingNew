FROM node:20-alpine

WORKDIR /app

ARG NEXT_PUBLIC_API_BASE_URL=https://bdauratrade.ngrok.app
ARG NEXT_PUBLIC_WS_URL=wss://bdauratrade.ngrok.app
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL

COPY package.json tsconfig.json next.config.mjs tailwind.config.ts postcss.config.mjs next-env.d.ts middleware.ts ./
COPY app ./app
COPY components ./components
COPY store ./store
COPY lib ./lib

RUN npm install
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]

