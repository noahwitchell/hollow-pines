import os, hashlib
os.chdir(os.path.dirname(os.path.abspath(__file__)) + '/..')
head = open('src/head.html').read()
game = open('src/game.js').read()
out0 = head + '\n<script>\n' + game + '\n</script>\n'
out = out0.replace('__BUILD__', hashlib.sha1(out0.encode()).hexdigest()[:7])
open('game.html', 'w').write(out)
open('_test.html', 'w').write('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n' + out)
print('built', len(out))
