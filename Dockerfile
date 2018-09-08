FROM node:latest@sha256:499dc14186a1f363c366f39aba4cf4e0a153aabc9ee3b5b5802dc6b29e3cef36

COPY . /app
WORKDIR /app

RUN npm install

CMD [ "npm", "start" ]
