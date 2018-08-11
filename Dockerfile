FROM node:latest@sha256:8062236dc2ee065a98af95eec74d5928d065194eb0ab8fffabdbc5cfaac2137a

COPY . /app
WORKDIR /app

RUN npm install

CMD [ "npm", "start" ]
