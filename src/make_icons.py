# Home-screen icon: a flashlight cone climbing a black 32 px grid, a pale shape and two eyes waiting at the top.
import zlib, struct, os, math
os.chdir(os.path.dirname(os.path.abspath(__file__)) + '/..')
N = 32
BG = (4, 5, 8); BEAM = (242, 226, 176); BEAM2 = (150, 128, 84); TRUNK = (74, 56, 40); SKIN = (184, 178, 166); EYE = (255, 246, 222)
g = [[BG] * N for _ in range(N)]
ox, oy = 15.5, 30.5
for y in range(N):
    for x in range(N):
        dx, dy = x + 0.5 - ox, y + 0.5 - oy
        d = math.hypot(dx, dy); a = abs(math.atan2(dx, -dy))
        if a < 0.42 and d < 27:
            f = (1 - a / 0.42) * max(0, 1 - d / 30)
            if f > 0.5: g[y][x] = BEAM
            elif f > 0.22: g[y][x] = BEAM2
            elif (x + y) % 2 == 0 and f > 0.06: g[y][x] = BEAM2
for x0, y0, y1 in ((6, 3, 26), (25, 2, 24), (11, 0, 12)):
    for y in range(y0, y1):
        for x in (x0, x0 + 1):
            g[y][x] = TRUNK
for y in range(6, 15):
    g[y][15] = SKIN; g[y][16] = SKIN
for y in range(8, 14):
    g[y][13] = SKIN; g[y][18] = SKIN
for x in range(14, 18):
    g[5][x] = SKIN; g[4][x] = SKIN
g[5][14] = EYE; g[5][17] = EYE
def png(path, S):
    k = S // N; raw = b''
    for y in range(S):
        raw += b'\x00' + b''.join(bytes(g[min(N - 1, y // k)][min(N - 1, x // k)]) for x in range(S))
    ch = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + ch(b'IHDR', struct.pack('>IIBBBBB', S, S, 8, 2, 0, 0, 0)) + ch(b'IDAT', zlib.compress(raw, 9)) + ch(b'IEND', b''))
png('docs/icon-192.png', 192); png('docs/icon-512.png', 512); png('docs/apple-touch-icon.png', 192)
print('icons written')
