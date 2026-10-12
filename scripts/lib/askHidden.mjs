/** Read a line with echo off (prints * per character). Raw-mode stdin, so it
 * works the same in PowerShell, cmd and bash, without readline internals. */
export function askHidden(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      console.error('Run this in an interactive terminal (it needs to read the password privately).');
      process.exit(1);
    }
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.resume();
    let value = '';
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') {
          stdin.setRawMode(false);
          process.stdout.write('\n');
          process.exit(130);
        }
        if (ch === '\u007f' || ch === '\b') {
          if (value.length) {
            value = value.slice(0, -1);
            process.stdout.write('\b \b');
          }
          continue;
        }
        value += ch;
        process.stdout.write('*');
      }
    };
    stdin.on('data', onData);
  });
}
