FROM node:20-alpine

WORKDIR /app

ARG NEXT_PUBLIC_REFERRAL_API_URL=
ARG NEXT_PUBLIC_MAIN_SITE_URL=
ENV NEXT_PUBLIC_REFERRAL_API_URL=$NEXT_PUBLIC_REFERRAL_API_URL
ENV NEXT_PUBLIC_MAIN_SITE_URL=$NEXT_PUBLIC_MAIN_SITE_URL

COPY package.json tsconfig.json next.config.mjs tailwind.config.ts postcss.config.mjs ./
COPY app ./app
COPY components ./components
COPY public ./public

RUN npm install
RUN npm run build

EXPOSE 3002

CMD ["npm", "run", "start"]

