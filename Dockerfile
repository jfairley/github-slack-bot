FROM node:latest@sha256:2cda73dd26369c2ec69130ddda6f83ff4980fd6fc8e73b5e670a7670d4c86ba0

COPY . /app
WORKDIR /app

RUN npm install

CMD [ "npm", "start" ]
