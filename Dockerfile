FROM node:latest@sha256:d64072a554283e64e1bfeb1bb457b7b293b6cd5bb61504afaa3bdd5da2a7bc4b

COPY . /app
WORKDIR /app

RUN npm install

CMD [ "npm", "start" ]
