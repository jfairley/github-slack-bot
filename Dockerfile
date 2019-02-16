FROM node:latest@sha256:0cc92d0934e9f990755b9b22bd449d665c559587b8f8bc4d0d4db33264f60762

COPY . /app
WORKDIR /app

RUN npm install

CMD [ "npm", "start" ]
