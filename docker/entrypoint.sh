function add_ip_route() {
  ip route add 202.0.0.0/8 dev ppp0
}
crond
pm2 l
node -r @std/esm lib/generate-vpn-config.js
if test ! -z "$USE_VPN"; then
  pon sysu persist
  test $? -ne 0 && echo failed to set up vpn && exit 1
  count=0
  retries=5
  add_ip_route
  while test $? -ne 0 -a $count -lt $retries; do
    count=`expr $count + 1`
    sleep 2;
    echo retrying add_ip_route
    add_ip_route
  done
  if test $count -eq $retries; then
    echo failed to set up vpn route
    exit 2
  fi
  echo vpn set up successfully
fi
pm2 start config/deploy.json
