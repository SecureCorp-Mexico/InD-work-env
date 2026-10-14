#!/usr/bin/env python3
"""Compare VLC-equivalent RTSP vs map go2rtc/MSE path for LPR live open."""
import json, urllib.request, time, socket, os, base64, struct, re, ssl
from urllib.parse import quote

def streams(srv):
    with urllib.request.urlopen(f"http://{srv}:1984/api/streams", timeout=15) as r:
        return json.load(r)

srv, src = "172.20.0.146", "i150200700_583_2_87_lpr_1"
data = streams(srv)
info = data[src]
url = (info.get("producers") or [{}])[0].get("url") or ""
red = re.sub(r"(://[^:/]+):([^@/]+)@", r"\1:***@", url)
print("MAP_STREAM_NAME", src)
print("MAP_GO2RTC_HOST", srv)
print("MAP_BROWSER_PATH", f"wss://mh.map.secure.vu/sv/{srv}/api/ws?src={src}")
print("VLC_EQUIVALENT_RTSP", red)

m = re.match(r"rtsp://(?:([^:/]+):([^@]*)@)?([^:/]+):?(\d+)?(/.*)?", url)
user, pw, cam_host, cam_port, cam_path = m.group(1), m.group(2), m.group(3), int(m.group(4) or 554), (m.group(5) or "/")
print("CAM", cam_host, cam_port, cam_path[:60])

def tcp_ms(host, port, n=5):
    times = []
    for _ in range(n):
        t0 = time.time()
        try:
            s = socket.create_connection((host, port), timeout=3)
            s.close()
            times.append(round((time.time() - t0) * 1000, 2))
        except Exception:
            times.append(None)
    return times

print("TCP_CAM_ms", tcp_ms(cam_host, cam_port))
print("TCP_GO2RTC_ms", tcp_ms(srv, 1984))

def rtsp_describe_ms(rtsp_url, timeout=5):
    m = re.match(r"rtsp://(?:([^:/]+):([^@]*)@)?([^:/]+):?(\d+)?(/.*)?", rtsp_url)
    user, pw, host, port, path = m.group(1), m.group(2), m.group(3), int(m.group(4) or 554), (m.group(5) or "/")
    t0 = time.time()
    s = socket.create_connection((host, port), timeout=timeout)
    t_tcp = time.time() - t0
    req = (
        f"DESCRIBE rtsp://{host}:{port}{path} RTSP/1.0\r\n"
        f"CSeq: 1\r\n"
        f"Accept: application/sdp\r\n"
        f"User-Agent: SecureVu-Probe\r\n"
    )
    if user is not None:
        token = base64.b64encode(f"{user}:{pw or ''}".encode()).decode()
        req += f"Authorization: Basic {token}\r\n"
    req += "\r\n"
    s.settimeout(timeout)
    s.sendall(req.encode())
    buf = b""
    try:
        while True:
            chunk = s.recv(4096)
            if not chunk:
                break
            buf += chunk
            if b"\r\n\r\n" in buf:
                break
    except Exception as e:
        s.close()
        return {"err": str(e), "t_tcp_ms": round(t_tcp * 1000), "total_ms": round((time.time() - t0) * 1000)}
    s.close()
    status = buf.split(b"\r\n", 1)[0].decode(errors="replace")
    return {"status": status, "t_tcp_ms": round(t_tcp * 1000), "t_describe_ms": round((time.time() - t0) * 1000), "bytes": len(buf)}

print("RTSP_DESCRIBE", rtsp_describe_ms(url))

for name in ["i150200700_580_2_39_lpr_1", "i150200700_578_2_10_bullet_1"]:
    u = ((streams("172.20.0.146").get(name) or {}).get("producers") or [{}])[0].get("url") or ""
    if u:
        print("RTSP_DESCRIBE", name, rtsp_describe_ms(u))

def timed_get(u, timeout=20):
    t0 = time.time()
    try:
        with urllib.request.urlopen(u, timeout=timeout) as r:
            data = r.read(64 * 1024)
            return round((time.time() - t0) * 1000), r.status, len(data)
    except Exception as e:
        return round((time.time() - t0) * 1000), None, str(e)[:80]

for label, host, name in [
    ("LPR583", "172.20.0.146", "i150200700_583_2_87_lpr_1"),
    ("LPR580", "172.20.0.146", "i150200700_580_2_39_lpr_1"),
    ("LPR565", "172.20.0.144", "i150200700_565_0_26_lpr_1"),
    ("LPR560_H265", "172.20.0.144", "i150200700_560_1_47_lpr_1"),
    ("BULLET578", "172.20.0.146", "i150200700_578_2_10_bullet_1"),
]:
    ms, st, n = timed_get(f"http://{host}:1984/api/frame.jpeg?src={quote(name)}")
    print(f"FRAMEJPEG {label} {ms}ms st={st} n={n}")

def mse_bins(host, src, timeout=12, want=3):
    path = f"/api/ws?src={quote(src)}"
    key = base64.b64encode(os.urandom(16)).decode()
    req = (
        f"GET {path} HTTP/1.1\r\nHost: {host}:1984\r\nUpgrade: websocket\r\n"
        f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
    ).encode()
    t0 = time.time()
    s = socket.create_connection((host, 1984), timeout=5)
    s.settimeout(timeout)
    s.sendall(req)
    buf = b""
    while b"\r\n\r\n" not in buf:
        buf += s.recv(4096)
    t_hs = time.time() - t0
    payload = json.dumps({
        "type": "mse",
        "value": "avc1.640029,avc1.64002A,avc1.640033,hvc1.1.6.L153.B0,mp4a.40.2",
    }).encode()
    mask = os.urandom(4)
    s.sendall(bytearray([0x81, 0x80 | len(payload)]) + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(payload)))
    acc = b""
    bins = []
    mime = None
    while time.time() - t0 < timeout and len(bins) < want:
        try:
            chunk = s.recv(65536)
        except Exception:
            break
        if not chunk:
            break
        acc += chunk
        while len(acc) >= 2:
            b0, b1 = acc[0], acc[1]
            op = b0 & 0x0F
            ln = b1 & 0x7F
            hdr = 2
            if ln == 126:
                if len(acc) < 4:
                    break
                ln = struct.unpack("!H", acc[2:4])[0]
                hdr = 4
            if len(acc) < hdr + ln:
                break
            data = acc[hdr:hdr + ln]
            acc = acc[hdr + ln:]
            if op == 1:
                msg = json.loads(data.decode())
                if msg.get("type") == "mse":
                    mime = msg.get("value")
                if msg.get("type") == "error":
                    s.close()
                    return {"err": msg.get("value"), "t_hs_ms": round(t_hs * 1000), "total_ms": round((time.time() - t0) * 1000)}
            elif op == 2:
                bins.append((round((time.time() - t0) * 1000), ln))
    s.close()
    return {"mime": mime, "t_hs_ms": round(t_hs * 1000), "bins_ms_bytes": bins}

print("MSE_DIRECT_583", mse_bins("172.20.0.146", "i150200700_583_2_87_lpr_1"))
print("MSE_DIRECT_580", mse_bins("172.20.0.146", "i150200700_580_2_39_lpr_1"))
print("MSE_DIRECT_BULLET", mse_bins("172.20.0.146", "i150200700_578_2_10_bullet_1"))

ctx = ssl._create_unverified_context()
for label, u in [
    ("proxy_streams", f"https://127.0.0.1/sv/172.20.0.146/api/streams?src={quote(src)}"),
    ("proxy_frame", f"https://127.0.0.1/sv/172.20.0.146/api/frame.jpeg?src={quote(src)}"),
]:
    t0 = time.time()
    try:
        with urllib.request.urlopen(u, timeout=20, context=ctx) as r:
            data = r.read(64 * 1024)
            print(label, round((time.time() - t0) * 1000), "ms", r.status, len(data))
    except Exception as e:
        print(label, "ERR", e)

u2 = ((data.get("i150200700_583_2_87_lpr_2") or {}).get("producers") or [{}])[0].get("url") or ""
print("LPR583_1_vs_2_same_url", url == u2)
