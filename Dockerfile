FROM node:alpine
COPY docker/repositories /etc/apk/repositories
RUN apk update && \
    # set timezone
    apk add pptpclient tesseract-ocr tzdata logrotate && \
    ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    # install logrotate and check rotate status every minute
    rm -f /etc/periodic/daily/logrotate /var/cache/apk/* && \
    (echo "$(crontab -l)" && echo "* * * * * /usr/sbin/logrotate /etc/logrotate.conf >> /var/log/logrotate.log 2&>1") | crontab - && \
    npm i pm2 -g
WORKDIR /sysu-score-elect
COPY docker/logrotate.conf /etc/logrotate.conf
COPY . .
RUN npm i && \
    cp docker/logrotate /etc/logrotate.d/sysu-score-elect && \
    mkdir -p /var/log/score /var/log/elect
ENTRYPOINT node -r @std/esm lib/generate-vpn-config && sh docker/entrypoint.sh && sh
