FROM node:alpine

COPY ./etc/repositories /etc/apk/repositories

RUN apk update && apk add pptpclient tesseract-ocr

WORKDIR /sysu-elect

COPY . .

RUN npm i && npm i pm2 -g && pm2 l

