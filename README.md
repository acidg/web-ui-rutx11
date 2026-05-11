# RUTX11 Mini WebUI

A minimal mobile-first WebUI for the Teltonika RUTX11 router, hosted directly on the device. Designed to replace the broken "Camper" mode in Teltonika's app.

## What it does

- **Status** — active uplink, IP address, SIM signal (RSSI/RSRP/RSRQ/SINR), configured campsite WiFi, and a "Prefer WiFi / Prefer Mobile" toggle
- **Add WiFi** — scan nearby networks, pick one, enter password; performs the full UCI sequence to make WiFi-as-WAN actually route traffic
- **Disconnect** — removes the WiFi STA and cleans up the network and firewall entries (no orphans)

## Why it exists

The stock RutOS WebUI is painful on mobile. Teltonika's app "Camper" mode connects to a WiFi network at Layer 2 but skips creating the `network.wwan` interface, adding it to the firewall WAN zone, and setting a routing metric — so all traffic still goes through the SIM even though the WiFi icon shows "connected".

## Deploy

```sh
./deploy.sh           # auto-detects router IP from default gateway
./deploy.sh 192.168.1.1   # or specify IP explicitly
```

Prompts for the router password. Open `https://<router-ip>/mini/` — add to home screen for PWA use.

## Stack

Vanilla JS (ES modules), no build step, no dependencies. Total payload < 50 KB.
