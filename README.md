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

## Getting the API description (for AI use)

The router-side REST API is documented at https://developers.teltonika-networks.com/ — but the docs site is a Nuxt SPA, so curl/WebFetch on a reference page returns only loader HTML. The actual OpenAPI 3.0 spec is served as a static JSON file. To pull it down for offline use:

1. **Pick the right spec filename.** Fetch the manifest and grep for your device + firmware:

   ```sh
   curl -sk --compressed https://developers.teltonika-networks.com/docs/available-docs.json \
     | jq '.[] | select(.familyName=="RUTX") | .devices[] | select(.deviceName=="RUTX11") | .versions["7.22.2"]'
   ```

   Each entry has a `name` like `7.22.2_v1.14.json`. Match the firmware to your device (`cat /etc/version` on the router, or check `GET /api/system/device/status`).

2. **Download the spec** by filename — no device path prefix:

   ```sh
   curl -sk --compressed https://developers.teltonika-networks.com/docs/7.22.2_v1.14.json -o rutx11-api.json
   ```

   It's a ~4 MB OpenAPI 3.0.0 document with `paths`, `tags`, `menu`, and Teltonika `x-web` extensions.

3. **Search it with `rg` / `jq`** to find endpoints. Useful starting points:

   ```sh
   # All paths
   jq -r '.paths | keys[]' rutx11-api.json

   # Endpoints under a topic
   jq -r '.paths | keys[] | select(test("wireless"))' rutx11-api.json

   # Method + summary for a path
   jq '.paths["/wireless/actions/join"]' rutx11-api.json
   ```

If the docs site structure changes, the loader pattern lives in the Nuxt entry bundle (`/_nuxt/<hash>.js`) — grep for ``fetch(`/docs/${...}`)`` to find the current URL template.
