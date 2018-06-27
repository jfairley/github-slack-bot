FROM node:latest@sha256:92f749eb7f99240cad108616985696469484f680dd227af24241465f2d3a147f

COPY . /app
WORKDIR /app

RUN npm install

CMD [ "npm", "start" ]
