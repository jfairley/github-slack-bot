FROM node:latest@sha256:cf2e3cd5251273c53bd5497b1a912a9956fb775710df8e015c835719f2ce7e14

COPY . /app
WORKDIR /app

RUN npm install

CMD [ "npm", "start" ]
