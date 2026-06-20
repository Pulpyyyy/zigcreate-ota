# [Bug] OTA Upgrade client silently resets the download to FileOffset=0 on a single ImageBlockResponse timeout (no block retry, no ABORT callback)

## Environment

| | |
|---|---|
| **esp-zigbee-lib** | `2.0.1` (dependency `espressif/esp-zigbee-lib: ~2.0.0`) |
| **ESP-IDF** | `v6.0.1` |
| **Chip** | ESP32-H2 (rev v1.2), native 802.15.4 radio |
| **Device role** | Router, ZCL OTA Upgrade **client** (cluster 0x0019) |
| **OTA coordinator/server** | Zigbee2MQTT (zigbee-herdsman 10.4.0) |
| **Requested block size** | 255 B via `ezb_zcl_ota_upgrade_set_download_block_size(ep, 255)` |
| **Actual ImageBlockResponse size from server** | ~50 B (one unfragmented secured 802.15.4 frame) |
| **Image size** | ~591 KB → ~11 800 blocks of 50 B |

## Summary

During a ZCL OTA download, if **one** `ImageBlockResponse` is lost/late, the OTA client's
response timeout fires (~7 s) and the client **silently resets the whole session**:
`FileOffset` → `0` and `ImageUpgradeStatus` → `0x00` (NORMAL). It does **not**:

1. retry the `ImageBlockRequest` for the current offset, and
2. notify the application via the progress callback (no `..._PROGRESS_ABORT`).

The client then stays idle and never issues another `ImageBlockRequest`, so the server
(Z2M) times out after 150 s ("device did not start/finish firmware download"). Because the
download restarts from scratch every time, and a ~591 KB image is ~11 800 tiny (50 B) blocks,
the probability of completing without a single lost block is effectively zero — the OTA
**never completes** on a real-world link.

## Steps to reproduce

1. ESP32-H2 router as OTA client, esp-zigbee-lib 2.0.1.
2. Z2M as OTA server, offer an image (~591 KB).
3. Start the OTA. The download progresses normally at ~50 B/block.
4. Wait for any single block exchange to be lost (happens within a few thousand blocks).

## Expected behavior

On an `ImageBlockResponse` timeout, the client re-sends the `ImageBlockRequest` for the
**current** `FileOffset` (bounded number of retries), preserving download progress. If it
ultimately gives up, it invokes the application progress callback with `ABORT` so the app can
clean up.

## Actual behavior

The client discards all progress (`FileOffset` → 0, `ImageUpgradeStatus` → NORMAL), issues no
further requests, and gives no callback. The transfer is dead; only a brand-new
server-initiated session (ImageNotify) can restart it — from offset 0.

## Evidence

Application-side trace (we poll the client's own ZCL attributes every 10 s during the transfer
and timestamp the last RECEIVING callback):

```
OTA START — ver=0x9B5754CC size=591102 B
OTA block #1 raw=50 B file_off=0 (written 0 B)
...
OTA poll:  idle=63ms    block#107 written=5288B | FileOffset=5350 status=0x01   <- downloading
OTA poll:  idle=3062ms  block#135 written=6688B | FileOffset=6750 status=0x01   <- last block #135
OTA STALL: idle=13063ms block#135 written=6688B | FileOffset=0    status=0x00   <- client reset!
OTA STALL: idle=23064ms block#135 written=6688B | FileOffset=0    status=0x00
```

- `status` (ImageUpgradeStatus 0x0006): `0x01` (DOWNLOAD_IN_PROGRESS) → `0x00` (NORMAL).
- `FileOffset` (0x0001): `6750` → `0`.
- No `PROGRESS_ABORT` (or any) callback fires; the application still believes a transfer is active.
- The stall offset is random across runs (observed at 6.5 KB, 32 KB, 56 KB, 84 KB) — consistent
  with a probabilistic single-block loss rather than a fixed boundary.

The corresponding server side reports:
`Device <addr> did not start/finish firmware download after being notified.
(Timeout after 150000ms [clusterId=25 cmdId=3])` — i.e. it is waiting for the next
`ImageBlockRequest` (cmd 0x03) that never comes.

## What we ruled out

- **Rate negotiation / MinimumBlockPeriod**: not the cause (and the 0x0009 attribute is not even
  exposed to read on the client here).
- **Application handler**: our progress handler writes every block correctly up to the stall;
  it receives no further callbacks after the reset.
- **Memory**: free heap is stable (~150 KB) at the stall.
- **Link jitter**: cadence is steady (~50 B every ~190–250 ms) right up to the cliff, then a clean
  stop — a single dropped frame, not progressive degradation.

## Suggested fix

In the OTA client downloading state machine (the `ota_upgrade_downloading_rsp_timeout` path):

1. On `ImageBlockResponse` timeout, **re-send `ImageBlockRequest` at the current `FileOffset`**
   with a bounded retry count, instead of resetting `FileOffset`/`ImageUpgradeStatus`.
2. Only after exhausting retries, abort — and **invoke the application progress callback with
   `ABORT`** so the app can release its `esp_ota_handle`.

This makes the transfer resilient to the inevitable single-block loss over a ~11 800-block
download.

## Workaround (works) — userspace OTA client

**A full userspace re-implementation of the OTA client works and makes OTA complete reliably
on a lossy link.** Details + empirical proof are in
[this follow-up comment](https://github.com/espressif/esp-zigbee-sdk/issues/833#issuecomment-4756769933);
full single-file reference: https://gist.github.com/Pulpyyyy/0241f09c90e120ca654aa29bdc6ac1e3

In short:
- Register a raw ZCL handler and **consume every genOta (0x0019) frame** so the built-in client
  stays dormant.
- Drive the transfer from the app: send `QueryNextImageRequest` / `ImageBlockRequest` /
  `UpgradeEndRequest` via `ezb_zcl_custom_cmd_req()` (it accepts the standard cluster 0x19), and
  parse responses from `raw_frame->payload`.
- **On a block timeout, re-send the `ImageBlockRequest` at the same `FileOffset`** (bounded
  retries) — Z2M serves it statelessly, so the download resumes. Observed recovering from 7
  consecutive lost blocks at one offset and completing the full ~593 KB image.

This confirms the root cause and the expected fix (retry the block instead of resetting), but it
is a heavy app-side workaround — the proper fix belongs in the precompiled OTA client.

### Workarounds that do NOT work
- **App-driven resume without bypassing the built-in client**: seed the `FileOffset` attribute
  and re-send a `QueryNextImageRequest`. The seed sticks, but Z2M does not answer a device-initiated
  query mid-session (it waits for an `ImageBlockRequest`), and there's no public API to make the
  built-in client re-issue a block request → the resume can't be driven this way.
- **Bigger blocks (APS fragmentation)** reduce the block count (fewer loss opportunities) but don't
  fix the underlying no-retry behavior.

---

## Full annotated serial trace

> **Note on instrumentation.** The `OTA block #N … file_off=…`, `OTA poll: …` and
> `OTA STALL: …` lines are **application-added**, not SDK logs. A watchdog task polls the
> OTA client's own public ZCL attributes every 10 s and timestamps each RECEIVING callback:
> - `FileOffset` = attribute `0x0001`
> - `status` = `ImageUpgradeStatus` attribute `0x0006`
> - `minBlockPeriod` = attribute `0x0009` (`65535` = our "attribute not present" sentinel — it is
>   not exposed on the client, hence unreadable; `FileOffset`/`status` are conclusive on their own)
> - `block#` / `written` = our RECEIVING-callback counter and `esp_ota_write` byte count
>
> This is exactly how we observed the client's internal reset without any SDK trace (the
> precompiled libs expose no ZBOSS trace symbols).

### Boot + transfer start (client cur_ver 0x9B5754CB, image 0x9B5754CC, 591102 B)

```
I zigbee: OTA client: mfr=0x5096 type=0x50C5 cur_ver=0x9B5754CB max_data=255
I zigbee: OTA ImageNotify received → kicking QueryNextImageRequest
I zigbee: OTA query_next_image sent (type=0x50C5 ver=0x9B5754CB)
I zigbee: OTA query resp → image available ver=0x9B5754CC size=591102 B
I zigbee: OTA START — mfr=0x5096 type=0x50C5 ver=0x9B5754CC size=591102 B
I zigbee: OTA partition: ota_0 @ 0x000F0000 size=786432
I zigbee: OTA block #1 raw=50 B file_off=0   (written 0 B)
I zigbee: OTA block #2 raw=50 B file_off=50  (written 0 B)
I zigbee: OTA block #3 raw=50 B file_off=100 (written 38 B)
I zigbee: OTA block #4 raw=50 B file_off=150 (written 88 B)
I zigbee: OTA block #5 raw=50 B file_off=200 (written 138 B)
...
```
Every block is **50 B** (server caps the ImageBlockResponse to a single secured frame; the
client requested 255 B). 591 KB / 50 B ≈ **11 800 blocks**.

### Normal progress (FileOffset advancing, status=0x01 DOWNLOAD_IN_PROGRESS)

```
W zigbee: OTA poll:  idle=64ms   block#27  written=1288B | FileOffset=1350 status=0x01 minBlockPeriod=65535 | heap=153312B
W zigbee: OTA poll:  idle=60ms   block#67  written=3288B | FileOffset=3350 status=0x01 minBlockPeriod=65535 | heap=155324B
I zigbee: OTA received 4 KB (block #84)
W zigbee: OTA poll:  idle=63ms   block#107 written=5288B | FileOffset=5350 status=0x01 minBlockPeriod=65535 | heap=155360B
W zigbee: OTA poll:  idle=3062ms block#135 written=6688B | FileOffset=6750 status=0x01 minBlockPeriod=65535 | heap=155360B
```

### The bug: single block lost → client resets the whole session (no retry, no callback)

```
W zigbee: OTA STALL: idle=13063ms block#135 written=6688B | FileOffset=0 status=0x00 minBlockPeriod=65535 | heap=155360B
W zigbee: OTA STALL: idle=23064ms block#135 written=6688B | FileOffset=0 status=0x00 minBlockPeriod=65535 | heap=155360B
```
- Last RECEIVING callback was block #135 (`written=6688B`); no further callbacks.
- `FileOffset`: `6750` → `0`; `status`: `0x01` → `0x00` (NORMAL).
- No `PROGRESS_ABORT` (or any) callback — the application still thinks a transfer is active.
- Stall offset varies run-to-run (also seen at 32 KB, 56 KB, 84 KB) → probabilistic single-block loss.

### Application auto-resume attempt fails (server ignores a device-initiated re-query)

```
W zigbee: OTA auto-resume: seeded FileOffset=6750, re-querying
I zigbee: OTA query_next_image sent (type=0x50C5 ver=0x9B5754CB)
W zigbee: OTA STALL: idle=33077ms block#135 written=6688B | FileOffset=6750 status=0x00 ...   <- seed sticks, still idle
W zigbee: OTA STALL: idle=43078ms block#135 written=6688B | FileOffset=6750 status=0x00 ...
W zigbee: OTA auto-resume: seeded FileOffset=6750, re-querying
I zigbee: OTA query_next_image sent (type=0x50C5 ver=0x9B5754CB)
   (... no "OTA query resp" ever follows any re-query — Z2M does not answer a device-initiated
        QueryNextImageRequest while it is waiting for the next ImageBlockRequest ...)
```
Writing `FileOffset` back works (it reads back `6750`), but the client never re-enters the
download state and there is no API to make it re-issue an `ImageBlockRequest`.

### Server side (Zigbee2MQTT)

```
z2m: OTA update of '<device>' failed (Device <addr> did not start/finish firmware download
     after being notified. (Timeout after 150000ms [clusterId=25 cmdId=3]))
```
`cmdId=3` = the server is waiting for the next `ImageBlockRequest` from the client, which never
comes after the client's silent reset.
