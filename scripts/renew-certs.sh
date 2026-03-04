#!/bin/bash
# Manual SSL renewal (certbot auto-renews via systemd timer, this is a convenience)
certbot renew
systemctl reload nginx
echo "Done. Certificates renewed and Nginx reloaded."
