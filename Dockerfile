FROM node:latest@sha256:055fe494189c1a9153d29bc1f666df25556ba8d08da92dee730cf840413d9055

COPY . /app
WORKDIR /app

RUN npm install

CMD [ "npm", "start" ]
