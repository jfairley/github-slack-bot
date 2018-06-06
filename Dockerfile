FROM node:latest@sha256:4287578448a0c0db97b52c6986a82bd5077045a5a221aceb2f73ada40ac90a30

COPY . /app
WORKDIR /app

RUN npm install

CMD [ "npm", "start" ]
