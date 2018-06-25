FROM node:latest@sha256:1201e1478ae2146ef699835a5726b1586e954b568962f5f937378d48de2e3014

COPY . /app
WORKDIR /app

RUN npm install

CMD [ "npm", "start" ]
