function add_ip_route() {
  ip route add 202.0.0.0/8 dev ppp0
}
# launch crond
crond
# launch pm2d
pm2 l
# attempt to generate vpn config
node -r @std/esm lib/generate-vpn-config.js
# if vpn config file generated
if test -f "/etc/ppp/peers/sysu"; then
  # connect to pptp
  pon sysu persist
  # if failed, exit
  test $? -ne 0 && echo failed to set up vpn && exit 1
  # variables for retry
  count=0
  # retries=5
  # first trial
  add_ip_route
  # retry
  # while test $? -ne 0 -a $count -lt $retries; do
  while test $? -ne 0; do
    count=`expr $count + 1`
    sleep 2;
    echo retrying add_ip_route
    add_ip_route
  done
  # run out of retry changes, exit
  # if test $count -eq $retries; then
  #   echo failed to set up vpn route
  #   exit 2
  # fi
  echo vpn set up successfully
fi
# start nodejs
pm2 start config/deploy.json
