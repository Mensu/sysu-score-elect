## 安装

需要 OCR 程序 tesseract

```
# ubuntu
apt install tesseract
# mac
brew install tesseract
```

```
npm i
# 直接启动
node -r @std/esm elect.js
# 或者通过 pm2
npm i -S -g pm2
pm2 startOrReload deploy.json
```

## docker

对ppp进行NAT

```
modprobe ip_nat_pptp
modprobe ip_conntrack_pptp
```