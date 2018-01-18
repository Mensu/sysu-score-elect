# !/bin/sh
pon sysu persist
ip route add 202.0.0.0/8 dev ppp0
pm2 start deploy.json
