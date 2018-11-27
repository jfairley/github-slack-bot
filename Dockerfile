FROM node:latest@sha256:7963d848677d0a965ad6ddce1d4dbc20f296fde327ae76f1d18d8330d3bcc959

COPY . /app
WORKDIR /app

RUN npm install

CMD [ "npm", "start" ]
