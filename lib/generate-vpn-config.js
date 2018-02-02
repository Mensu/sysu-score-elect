import fs from 'fs';
import { promisify } from 'util';
import config from '../config';

function main() {
  const { credentials, vpn } = config;
  if (!vpn) return;
  const USERNAME = vpn.username || credentials[0];
  const PASSWORD = vpn.password || credentials[1];

  const chap_secrets = promisify(fs.writeFile)('/etc/ppp/chap-secrets', `${USERNAME} sysu "${PASSWORD}" *`);
  const sysu = promisify(fs.writeFile)('/etc/ppp/peers/sysu', `pty "pptp ${vpn.remote} --nolaunchpppd"
  lock
  noauth
  nobsdcomp
  nodeflate
  name ${USERNAME}
  remotename sysu
  ipparam sysu
  mppe-stateful
  require-mppe-128
  lcp-max-failure 10000
  lcp-max-configure 10000
  maxfail 0
  `);

  Promise.all([chap_secrets, sysu]).catch(e => { console.error(e); process.exit(1); });
}

main();
