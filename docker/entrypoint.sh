function add_ip_route() {
  ip route add 202.0.0.0/8 dev ppp0
}
# launch crond
crond
# launch pm2d
pm2 l
# attempt to generate vpn config
node -r esm lib/generate-vpn-config.js
# if vpn config file generated
if test -f "/etc/ppp/peers/sysu"; then
  # connect to pptp
  pon sysu persist
  # if failed, exit
  test $? -ne 0 && echo failed to set up vpn && exit 1
  add_ip_route
  while test $? -ne 0; do
    sleep 2;
    echo retrying add_ip_route
    add_ip_route
  done
  echo vpn set up successfully
fi
# start nodejs
pm2 start config/deploy.json
