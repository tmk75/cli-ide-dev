const readline = require('readline');

function hideCursor() {
  process.stdout.write('\x1B[?25l');
}

function showCursor() {
  process.stdout.write('\x1B[?25h');
}

function clearScreen() {
  process.stdout.write('\x1B[2J\x1B[H');
}

function pickList({ title, items }) {
  return new Promise((resolve) => {
    if (!items.length) {
      resolve(null);
      return;
    }

    if (!process.stdin.isTTY) {
      resolve(items[0]);
      return;
    }

    let list = items.slice();
    let index = 0;
    let query = '';

    function applyFilter() {
      const q = query.trim().toLowerCase();
      list = q
        ? items.filter((item) => String(item.label || item).toLowerCase().includes(q))
        : items.slice();
      if (list.length) index = Math.min(index, list.length - 1);
    }

    function render() {
      clearScreen();
      const lines = [];
      lines.push(title);
      lines.push('Type to filter · ↑/↓ move · Enter select · Esc back · Ctrl+C quit');
      lines.push(query ? `Filter: ${query}` : '');
      lines.push('');

      const pageSize = process.stdout.rows ? Math.max(5, process.stdout.rows - 7) : 15;
      const start = Math.max(0, index - Math.floor(pageSize / 2));
      const end = Math.min(list.length, start + pageSize);

      for (let i = start; i < end; i++) {
        const label = String(list[i].label || list[i]);
        const prefix = i === index ? '> ' : '  ';
        if (i === index) {
          lines.push(`\x1B[7m${prefix}${label}\x1B[0m`);
        } else {
          lines.push(`${prefix}${label}`);
        }
      }

      lines.push('');
      lines.push(`${list.length} result(s)`);
      process.stdout.write(lines.join('\n'));
    }

    function cleanup() {
      process.stdin.removeListener('keypress', onKeypress);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      showCursor();
    }

    function done(value) {
      cleanup();
      resolve(value);
    }

    function onKeypress(str, key) {
      if (key.ctrl && key.name === 'c') {
        cleanup();
        process.exit(0);
      } else if (key.name === 'escape') {
        done(null);
      } else if (key.name === 'up') {
        if (list.length) index = Math.max(0, index - 1);
        render();
      } else if (key.name === 'down') {
        if (list.length) index = Math.min(list.length - 1, index + 1);
        render();
      } else if (key.name === 'return') {
        done(list[index] || null);
      } else if (key.name === 'backspace') {
        query = query.slice(0, -1);
        applyFilter();
        render();
      } else if (str && str.length === 1 && str >= ' ' && str !== '\u0000') {
        query += str;
        applyFilter();
        render();
      }
    }

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('keypress', onKeypress);
    hideCursor();
    render();
  });
}

module.exports = { pickList };
