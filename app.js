'use strict';
const $ = id => document.getElementById(id);
const card = $('card'),
  ctx = card.getContext('2d', {
    alpha: false
  });
const palettes = [
  ['블루 미스트', '#e8ddcd', '#a9bfc0', '#6893a9'],
  ['로즈 블러', '#f2f1f0', '#f1dce0', '#f2b8c7'],
  ['플럼 그레인', '#301733', '#b97775', '#dfdfaa'],
  ['스틸 그레인', '#afc4d2', '#4a6475', '#deebf1'],
  ['잉크 하프톤', '#cfdfde', '#9dbdc8', '#253e62'],
  ['라일락 코랄', '#8c7ae6', '#e67a7a', '#fff2da']
];
// 굴림: 기기에 Microsoft 굴림이 있거나 파일을 불러왔으면 그것을, 없으면 내장 백묵 굴림을 쓴다.
const fonts = {
  pret: 'Pret',
  sans: 'Gothic',
  gulim: 'MSSceneGulim, Baekmuk',
  serif: 'Book'
};
const people = new Map(),
  colors = ['#654261', '#335573', '#635329', '#346259'];
const state = {
  bg: 'gradient',
  preset: 0,
  showNames: true,
  pad: 15,
  mode: 'book',
  palette: palettes[0].slice(1),
  ink: '#292532',
  marker: '#ffe194',
  image: null,
  colorSet: ''
};

// 꾸미기 설정은 기기(localStorage)에 보관해 새로고침이나 원문 삭제 뒤에도 유지한다.
const settingsKey = 'scene-settings',
  setsKey = 'scene-color-sets';
const isHex = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

function readStore(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return value ?? fallback;
  } catch {
    return fallback
  }
}

function writeStore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {}
}

function cleanPerson(v) {
  if (!v || typeof v !== 'object') return null;
  return {
    color: isHex(v.color) ? v.color : colors[0],
    bubble: isHex(v.bubble) ? v.bubble : '#ffffff',
    right: v.right === true
  };
}
const savedSettings = readStore(settingsKey, {});
if (savedSettings && typeof savedSettings === 'object') {
  const s = savedSettings;
  if (['half', 'gradient', 'photo', 'solid'].includes(s.bg)) state.bg = s.bg;
  if (Number.isInteger(s.preset) && s.preset >= 0 && s.preset < palettes.length) state.preset = s.preset;
  if (Array.isArray(s.palette) && s.palette.length === 3 && s.palette.every(isHex)) state.palette = s.palette.slice();
  if (isHex(s.ink)) state.ink = s.ink;
  if (isHex(s.marker)) state.marker = s.marker;
  if (typeof s.showNames === 'boolean') state.showNames = s.showNames;
  if ([8, 15, 24].includes(s.pad)) state.pad = s.pad;
  if (['book', 'chat'].includes(s.mode)) state.mode = s.mode;
  if (typeof s.colorSet === 'string') state.colorSet = s.colorSet;
  if (s.people && typeof s.people === 'object')
    for (const [name, v] of Object.entries(s.people)) {
      const p = cleanPerson(v);
      if (p) people.set(name, p);
    }
}
let pages = [
    []
  ],
  pageIndex = 0,
  packing = false,
  rev = 0,
  frame = 0,
  fileRevision = 0,
  ready = false;
const source = $('source'),
  large = $('large'),
  editor = $('editor');

function button(parent, label, action) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.onclick = action;
  parent.append(b);
  return b
}

function colorControl(parent, label, value, change) {
  const wrap = document.createElement('label'),
    input = document.createElement('input');
  wrap.className = 'color';
  input.type = 'color';
  input.value = value;
  input.setAttribute('aria-label', label);
  input.oninput = () => {
    change(input.value);
    schedule()
  };
  wrap.append(input, label);
  parent.append(wrap)
}

function parsePage(text) {
  const blocks = [];
  let current = null;
  for (const raw of text.split('\n')) {
    if (!raw.trim()) {
      current = null;
      continue
    }
    const line = raw.trim(),
      named = line.match(/^(?:\*\*)?([^:*：|]{1,36}?)(?:\*\*)?\s*[:：|](?:\*\*)?\s*(.*)$/);
    const stage = /^\*(?!\*)[\s\S]*[^*]\*$/.test(line);
    if (named) {
      current = {
        who: named[1].trim(),
        text: named[2].trimStart()
      };
      blocks.push(current)
    } else if (/^(?:“[\s\S]*”|"[\s\S]*"|「[\s\S]*」)$/.test(line)) {
      blocks.push({
        who: '대사',
        text: line
      });
      current = null
    } else if (stage || !current) {
      current = {
        who: '',
        text: raw
      };
      blocks.push(current);
      if (stage) current = null
    } else current.text += (current.text ? '\n' : '') + raw;
  }
  return blocks.filter(b => b.text.trim());
}

function readBlocks() {
  pages = source.value.replace(/\r\n?/g, '\n').split(/^[ \t]*---[ \t]*$/m).map(parsePage).filter(page => page.length);
  if (!pages.length) pages = [
    []
  ];
  pageIndex = Math.min(pageIndex, pages.length - 1);
  updatePageNav();
  const blocks = pages.flat();
  const names = [...new Set(blocks.map(b => b.who).filter(Boolean))];
  const activeSet = colorSets().find(set => set.name === state.colorSet);
  for (const n of names) {
    if (!people.has(n)) {
      const k = people.size;
      people.set(n, cleanPerson(activeSet?.people[n]) || {
        color: colors[k % colors.length],
        right: false,
        bubble: '#ffffff'
      })
    }
  }
  currentNames = names;
  $('speakers').replaceChildren();
  $('chatPeople').replaceChildren();
  $('chatOptions').hidden = state.mode !== 'chat';
  for (const n of names) {
    const person = people.get(n);
    colorControl($('speakers'), n, person.color, value => person.color = value);
    if (state.mode !== 'chat') continue;
    const row = document.createElement('div');
    row.className = 'speaker';
    colorControl(row, n + ' 말풍선', person.bubble, value => person.bubble = value);
    const side = document.createElement('select');
    side.setAttribute('aria-label', n + ' 말풍선 위치');
    side.add(new Option('왼쪽', 'left'));
    side.add(new Option('오른쪽', 'right'));
    side.value = person.right ? 'right' : 'left';
    side.onchange = () => {
      person.right = side.value === 'right';
      schedule()
    };
    row.append(side);
    $('chatPeople').append(row);
  }
  schedule();
}

function addTools(toolbar, area) {
  for (const [name, mark] of [
      ['굵게', '**'],
      ['기울임', '*'],
      ['형광펜', '==']
    ]) {
    const b = button(toolbar, 'A', () => {
      let start = area.selectionStart,
        end = area.selectionEnd,
        selected = area.value.slice(start, end),
        before = area.value.slice(0, start),
        after = area.value.slice(end);
      if (start !== end && before.endsWith(mark) && after.startsWith(mark)) {
        area.setRangeText(selected, start - mark.length, end + mark.length, 'select')
      } else if (selected.startsWith(mark) && selected.endsWith(mark) && selected.length > 2 * mark.length) {
        area.setRangeText(selected.slice(mark.length, -mark.length), start, end, 'select')
      } else {
        area.setRangeText(mark + selected + mark, start, end, 'end');
        area.setSelectionRange(start + mark.length, end + mark.length)
      }
      area.focus();
      sync(area)
    });
    b.title = name;
    b.setAttribute("aria-label", name);
    b.onmousedown = e => e.preventDefault();
    if (mark === '**') b.style.fontWeight = 'bold';
    if (mark === '*') b.style.fontStyle = 'italic';
    if (mark === '==') b.style.textDecoration = 'underline 4px #efce81'
  }
}

function sync(area) {
  const other = area === source ? large : source,
    top = other.scrollTop;
  if (other.value !== area.value) other.value = area.value;
  other.scrollTop = top;
  readBlocks();
  rememberEditor();
}
addTools($('inlineTools'), source);
addTools($('largeTools'), large);
source.oninput = () => sync(source);
large.oninput = () => sync(large);
$('expand').onclick = () => {
  if (large.value !== source.value) large.value = source.value;
  source.blur();
  editor.showModal();
  $('done').focus({
    preventScroll: true
  })
};
$('done').onclick = () => editor.close();
editor.onclose = () => {
  const top = source.scrollTop;
  source.setSelectionRange(large.selectionStart, large.selectionEnd);
  source.scrollTop = top;
  $('expand').focus({
    preventScroll: true
  })
};
for (const [toolbar, area] of [
    [$('inlineTools'), source],
    [$('largeTools'), large]
  ]) {
  // 모바일 기본 확인창은 '확인' 터치가 아래 버튼(첫 번째 배경 프리셋 등)까지 눌리거나
  // 페이지가 다시 불러와지는 일이 있어, 버튼을 한 번 더 누르는 방식으로 확인한다.
  let disarm = 0;
  const reset = () => {
    clearTimeout(disarm);
    delete clear.dataset.armed;
    clear.textContent = '전체 삭제';
  };
  const clear = button(toolbar, '전체 삭제', () => {
    if (!area.value) return reset();
    if (!clear.dataset.armed) {
      clear.dataset.armed = '1';
      clear.textContent = '한 번 더 눌러 삭제';
      disarm = setTimeout(reset, 3000);
      return;
    }
    reset();
    area.value = '';
    area.scrollTop = 0;
    sync(area);
  });
  clear.addEventListener('blur', reset);
  clear.className = 'clear-source';
  clear.setAttribute('aria-label', '대화 원문 전체 삭제');
}
const viewport = window.visualViewport;

function fitEditor() {
  if (!viewport) return;
  if (editor.open) {
    editor.style.setProperty('--visible-top', viewport.offsetTop + 'px');
    editor.style.setProperty('--visible-height', viewport.height + 'px');
  } else if (document.activeElement === source && matchMedia('(max-width:740px)').matches) {
    const overlap = source.getBoundingClientRect().bottom - (viewport.offsetTop + viewport.height - 84);
    if (overlap > 0) window.scrollBy(0, overlap);
  }
}
viewport?.addEventListener('resize', fitEditor);
viewport?.addEventListener('scroll', () => {
  if (editor.open) fitEditor()
});
source.addEventListener('focus', () => requestAnimationFrame(fitEditor));
large.addEventListener('focus', fitEditor);
$('expand').addEventListener('click', fitEditor);

function mobile(view) {
  const edit = view === 'edit';
  $('controls').classList.toggle('mobile-off', !edit);
  $('preview').classList.toggle('mobile-off', edit);
  for (const b of $('mobileTabs').children) b.setAttribute('aria-pressed', b.dataset.view === view)
}
mobile('edit');
for (const b of $('mobileTabs').children) b.onclick = () => {
  mobile(b.dataset.view);
  $('mobileTabs').scrollIntoView({
    block: 'start'
  })
};
for (const b of $('modes').children) b.onclick = () => {
  state.mode = b.dataset.mode;
  for (const x of $('modes').children) x.setAttribute('aria-pressed', x === b);
  readBlocks()
};
for (const [key, label] of [
    ['half', '하프톤'],
    ['gradient', '그라데이션'],
    ['photo', '사진'],
    ['solid', '단색']
  ]) {
  const b = button($('bgtypes'), label, () => {
    state.bg = key;
    bgControls();
    schedule()
  });
  b.dataset.bg = key;
  const thumb = document.createElement('span');
  thumb.className = 'thumb ' + key;
  b.prepend(thumb)
}

function bgControls() {
  const photo = state.bg === 'photo',
    gradient = ['half', 'gradient'].includes(state.bg);
  for (const b of $('bgtypes').children) b.setAttribute('aria-pressed', b.dataset.bg === state.bg);
  $('photoOptions').hidden = !photo;
  $('gradientOpts').hidden = !gradient;
  $('presets').hidden = !gradient;
  $('bgColors').replaceChildren();
  if (!photo) state.palette.slice(0, gradient ? 3 : 1).forEach((c, i) => colorControl($('bgColors'), gradient ? '색 ' + (i + 1) : '배경색', c, v => state.palette[i] = v))
}
for (const [index, [name, ...p]] of palettes.entries()) {
  const b = button($('presets'), '', () => {
    state.preset = index;
    state.palette = p.slice();
    $('angle').value = 0;
    updateOutputs();
    bgControls();
    schedule()
  });
  b.style.background = 'radial-gradient(ellipse at 45% 58%, ' + p[2] + ', ' + p[1] + ' 48%, ' + p[0] + ' 88%)';
  b.setAttribute('aria-label', name + ' 팔레트');
  b.title = name;
}
$('photoInput').onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  const ticket = ++fileRevision,
    url = URL.createObjectURL(file),
    img = new Image();
  try {
    img.src = url;
    await img.decode();
    if (ticket === fileRevision) {
      state.image = img;
      $('photoName').textContent = file.name;
      schedule()
    }
  } catch {
    if (ticket === fileRevision) $('photoName').textContent = '사진을 읽을 수 없어요. JPG나 PNG를 선택해 주세요.'
  } finally {
    URL.revokeObjectURL(url);
    e.target.value = ''
  }
};
colorControl($('inkColors'), '지문색', state.ink, v => state.ink = v);
colorControl($('inkColors'), '형광펜색', state.marker, v => state.marker = v);
let paperColor = isHex(savedSettings?.paper) ? savedSettings.paper : '#fffdf9';
colorControl($('paperColor'), '종이 색상', paperColor, value => paperColor = value);
const sliders = ['width', 'angle', 'size', 'margin', 'padding', 'opacity', 'tracking', 'stretch', 'spaceWidth', 'leading', 'paragraph'];

function updateOutputs() {
  for (const id of sliders) $(id + 'Num').value = $(id).value
}
for (const id of sliders) {
  const range = $(id),
    num = $(id + 'Num');
  range.oninput = () => {
    num.value = range.value;
    schedule()
  };
  num.oninput = () => {
    if (num.value !== '' && num.validity.valid) {
      range.value = num.value;
      schedule()
    }
  };
  num.onchange = () => {
    if (num.value !== '') range.value = String(num.valueAsNumber);
    num.value = range.value;
    schedule()
  };
  num.onblur = () => {
    if (num.value === '') num.value = range.value
  };
  num.onkeydown = e => {
    if (e.key === 'Enter') num.blur()
  };
}
$('ratio').onchange = () => {
  $('customRatio').hidden = $('ratio').value !== 'custom';
  $('ratioError').textContent = '';
  schedule();
};
for (const id of ['ratioX', 'ratioY']) $(id).oninput = schedule;
let removeQuotes = false;
for (const toolbar of [$('inlineTools'), $('largeTools')]) {
  const toggle = button(toolbar, '따옴표 삭제', () => {
    removeQuotes = !removeQuotes;
    for (const b of document.querySelectorAll('.quote-toggle')) b.setAttribute('aria-pressed', String(removeQuotes));
    schedule();
  });
  toggle.className = 'quote-toggle';
  toggle.setAttribute('aria-pressed', 'false');
}

function unquote(text) {
  return text.replace(/(?<![\p{L}\p{N}])['’]|['’](?![\p{L}\p{N}])|["“”‘「」『』«»]/gu, '');
}

let gulimAvailable = false,
  gulimCheck = null;
// Microsoft 굴림을 찾는 동안에도 내장 백묵 굴림으로 바로 그리고, 찾으면 다시 그린다.
async function prepareGulim() {
  if ($('font').value !== 'gulim') {
    $('gulimHelp').hidden = true;
    return
  }
  if (!gulimCheck) gulimCheck = findGulim().catch(() => false);
  if (!gulimAvailable && await gulimCheck) {
    gulimAvailable = true;
    loaded.delete(fonts.gulim);
    schedule();
  }
  $('gulimHelp').hidden = gulimAvailable || $('font').value !== 'gulim';
  $('gulimMessage').textContent = 'Microsoft 굴림이 없어 백묵 굴림으로 표시돼요. 파일을 선택하면 이 기기에서 Microsoft 굴림을 써요.';
}
$('font').onchange = () => {
  schedule();
  prepareGulim();
};
$('gulimFile').onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = extractGulim(await file.arrayBuffer());
    await registerGulim(data);
    gulimAvailable = true;
    loaded.delete(fonts.gulim);
    try {
      await fontCache(data)
    } catch {}
    $('gulimHelp').hidden = true;
    schedule();
  } catch {
    $('gulimMessage').textContent = 'Microsoft gulim.ttc 파일을 확인해 주세요.'
  }
  e.target.value = '';
};
$('names').onclick = () => {
  state.showNames = !state.showNames;
  $('names').setAttribute('aria-pressed', String(state.showNames));
  $('names').textContent = state.showNames ? '이름 표시 ✓' : '이름 표시';
  schedule();
};
$('names').textContent = '이름 표시 ✓';
for (const b of $('pads').children) b.onclick = () => {
  state.pad = Number(b.dataset.pad);
  for (const item of $('pads').children) item.setAttribute('aria-pressed', String(item === b));
  schedule();
};

function styled(text) {
  const pattern = /(\*\*|==|\*)/g,
    parts = text.split(pattern),
    styles = {
      bold: false,
      italic: false,
      highlight: false
    },
    out = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i],
      key = {
        '**': 'bold',
        '*': 'italic',
        '==': 'highlight'
      } [part];
    if (key && (styles[key] || parts.indexOf(part, i + 1) !== -1)) styles[key] = !styles[key];
    else if (part) out.push({
      ...styles,
      text: part
    })
  }
  return out
}

function face(run, size) {
  return (run.italic ? 'italic ' : '') + (run.bold ? '700 ' : '400 ') + size + 'px ' + fonts[$('font').value] + ', sans-serif'
}
const seg = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('ko', {
  granularity: 'grapheme'
}) : null;

function layout(text, size, width, sourceRuns = styled(text)) {
  const stretch = Number($('stretch').value) / 100,
    spaceWidth = Number($('spaceWidth').value) / 100;
  ctx.letterSpacing = (size * Number($('tracking').value) / 100) + 'px';
  const rows = [],
    tokens = [];
  for (const run of sourceRuns) {
    const font = face(run, size);
    ctx.font = font;
    for (const part of run.text.match(/\n|[^\S\n]+|[^\s]+/gu) || []) {
      const kind = part === '\n' ? 'break' : /^\s/u.test(part) ? 'space' : 'word';
      let token = tokens[tokens.length - 1];
      if (!token || kind !== token.kind || kind === 'break') {
        token = {
          kind,
          runs: [],
          width: 0
        };
        tokens.push(token);
      }
      const w = ctx.measureText(part).width * stretch * (kind === 'space' ? spaceWidth : 1);
      token.runs.push({
        text: part,
        font,
        highlight: run.highlight,
        w
      });
      token.width += w;
    }
  }
  let row = {
      runs: [],
      width: 0
    },
    gap = null;

  function finish() {
    rows.push(row);
    row = {
      runs: [],
      width: 0
    }
  }

  function append(run) {
    row.runs.push(run);
    row.width += run.w
  }
  for (const token of tokens) {
    if (token.kind === 'break') {
      gap = null;
      finish();
      continue
    }
    if (token.kind === 'space') {
      gap = token;
      continue
    }
    if (row.runs.length && row.width + (gap?.width || 0) + token.width > width) {
      finish();
      gap = null
    }
    if (gap) {
      if (gap.width + token.width <= width) gap.runs.forEach(append);
      gap = null;
    }
    if (token.width <= width) {
      token.runs.forEach(append);
      continue
    }
    for (const run of token.runs) {
      ctx.font = run.font;
      for (const item of seg ? seg.segment(run.text) : run.text) {
        const char = typeof item === 'string' ? item : item.segment;
        const w = ctx.measureText(char).width * stretch;
        if (row.runs.length && row.width + w > width) finish();
        append({
          ...run,
          text: char,
          w
        });
      }
    }
  }
  finish();
  return rows;
}

function paintRows(rows, x, y, line, size, color) {
  const stretch = Number($('stretch').value) / 100;
  ctx.save();
  ctx.translate(x, 0);
  ctx.scale(stretch, 1);
  ctx.letterSpacing = (size * Number($('tracking').value) / 100) + 'px';
  for (const row of rows) {
    let at = 0;
    for (const run of row.runs) {
      const width = run.w / stretch;
      ctx.font = run.font;
      if (run.highlight) {
        ctx.fillStyle = state.marker;
        ctx.fillRect(at, y - size * .82, width, size * 1.06)
      }
      ctx.fillStyle = color;
      ctx.fillText(run.text, at, y);
      at += width;
    }
    y += line;
  }
  ctx.restore();
}

function background(w, h) {
  const p = state.palette;
  ctx.fillStyle = p[0];
  ctx.fillRect(0, 0, w, h);
  if (state.bg === 'photo' && state.image) {
    const img = state.image,
      s = Math.max(w / img.width, h / img.height);
    ctx.drawImage(img, Math.floor((w - img.width * s) / 2) - 1, Math.floor((h - img.height * s) / 2) - 1, Math.ceil(img.width * s) + 2, Math.ceil(img.height * s) + 2)
  }
  if (state.bg === 'half' || state.bg === 'gradient') {
    const angle = Number($('angle').value) * Math.PI / 180;
    ctx.save();
    ctx.scale(w, h);
    ctx.translate(.5, .5);
    ctx.rotate(angle);
    ctx.translate(-.5, -.5);
    const mist = (x, y, rx, ry, color) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(rx, ry);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, color);
      g.addColorStop(.32, color + 'e8');
      g.addColorStop(.68, color + '72');
      g.addColorStop(1, color + '00');
      ctx.fillStyle = g;
      ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
    };
    if (state.preset < 2) {
      mist(.5, .5, .83, .46, p[1]);
      mist(.51, .53, .65, .36, p[2])
    } else if (state.preset === 5) {
      mist(.13, .22, 0.89, .81, p[1]);
      mist(.01, .58, .49, .46, p[2]);
      mist(.91, .94, 0.412, .76, p[2]);
    } else if (state.preset === 2) {
      mist(-.08, .27, .59, .61, p[1]);
      mist(-.08, .51, .38, .35, p[2]);
      mist(1.02, 1.02, .55, .33, p[2])
    } else {
      mist(.77, .17, .7, .52, p[1]);
      mist(.12, .36, .68, .36, p[state.preset === 3 ? 1 : 0]);
      mist(.91, .95, .69, .38, p[state.preset === 3 ? 1 : 2]);
      mist(.73, .54, .65, .32, p[state.preset === 3 ? 2 : 0]);
      if (state.preset === 4) mist(.96, .1, .58, .46, p[2])
    }
    ctx.restore();
    if (state.bg === 'half') {
      ctx.fillStyle = p[2];
      ctx.globalAlpha = .43;
      for (let y = 0; y < h; y += 8) {
        ctx.beginPath();
        for (let x = 0; x < w; x += 8) {
          const u = x / w - .5,
            v = y / h - .5;
          const phase = u * Math.cos(angle) + v * Math.sin(angle);
          const r = .35 + 3.2 * Math.min(1, Math.max(0, .5 + phase + .22 * Math.sin(y / h * 6 + x / w * 3)));
          ctx.moveTo(x + r, y);
          ctx.arc(x, y, r, 0, Math.PI * 2)
        }
        ctx.fill()
      }
      ctx.globalAlpha = 1;
    } else {
      ctx.globalAlpha = [.10, .065, .24, .35, .12, .24][state.preset];
      ctx.fillStyle = grain;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1
    }
  }
}

function makeGrain() {
  const tile = document.createElement('canvas');
  tile.width = tile.height = 192;
  const t = tile.getContext('2d'),
    pixels = t.createImageData(192, 192);
  let seed = 731;
  for (let i = 0; i < pixels.data.length; i += 4) {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    const v = seed >>> 24;
    pixels.data.set([v, v, v, 255], i)
  }
  t.putImageData(pixels, 0, 0);
  return ctx.createPattern(tile, 'repeat')
}
const grain = makeGrain();

function round(x, y, w, h, r, fill) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill()
}

function render(blocks = pages[pageIndex]) {
  const w = Number($('width').value),
    size = Number($('size').value),
    line = Math.round(size * Number($('leading').value) / 100);
  const fraction = Number($('margin').value) / 200,
    chat = state.mode === 'chat';
  const ratio = $('ratio').value,
    parts = ratio === 'custom' ? [$('ratioX').valueAsNumber, $('ratioY').valueAsNumber] : ratio.split(':').map(Number),
    fixed = ratio !== 'free';
  const fixedHeight = fixed ? Math.round(w * parts[1] / parts[0]) : 0;
  const invalidRatio = fixed && (!parts.every(v => Number.isFinite(v) && v > 0) || fixedHeight < 1 || fixedHeight > 14500);
  $('ratioError').textContent = invalidRatio ? '양수를 입력하고 출력 높이를 1~14500px로 맞춰주세요.' : '';
  if (invalidRatio) {
    card.width = w;
    card.height = 1;
    $('dimensions').textContent = '';
    $('status').textContent = $('ratioError').textContent;
    ready = false;
    $('saveAll').disabled = true;
    $('save').disabled = true;
    return;
  }
  const edge = Math.round(w * fraction),
    edgeY = fixed ? Math.round(fixedHeight * fraction) : edge;
  const padding = Number($('padding').value) / 200;
  const outerX = edge + Math.round((w - 2 * edge) * padding);
  const outerY = edgeY + Math.round((fixed ? fixedHeight - 2 * edgeY : w - 2 * edge) * padding);
  const padX = state.pad,
    padY = Math.round(state.pad * .72),
    nameSize = Math.round(size * .75);

  function measure(scale) {
    const inner = (w - 2 * outerX) / scale,
      plans = [];
    let y = 0;
    for (const block of blocks) {
      const bubble = chat && Boolean(block.who),
        label = state.showNames && Boolean(block.who);
      const rows = layout(removeQuotes ? unquote(block.text) : block.text, size, bubble ? inner * .81 - 2 * padX : inner);
      const height = rows.length * line + (bubble ? 2 * padY : 0);
      if (plans.length) y += Math.round(size * Number($('paragraph').value) / 100);
      const top = y + (label ? nameSize + 6 : 0);
      plans.push({
        block,
        rows,
        bubble,
        label,
        top,
        height
      });
      y = top + height;
      if (!fixed && y > 14500) break;
    }
    return {
      inner,
      plans,
      height: y
    };
  }
  let scale = 1,
    plan = measure(1);
  if (fixed && plan.height > fixedHeight - 2 * outerY) {
    let lo = 0,
      hi = 1;
    for (let i = 0; i < 10; i++) {
      const mid = (lo + hi) / 2;
      if (measure(mid).height * mid <= fixedHeight - 2 * outerY) lo = mid;
      else hi = mid;
    }
    scale = lo || Math.min(1, (fixedHeight - 2 * outerY) / plan.height);
    plan = measure(scale);
  }
  const {
    inner,
    plans
  } = plan, margin = outerX;
  const tooLong = !fixed && plan.height + 2 * outerY > 14500,
    missingPhoto = state.bg === 'photo' && !state.image;
  card.width = w;
  card.height = fixed ? fixedHeight : tooLong ? 560 : Math.max(1, plan.height + 2 * outerY);
  const h = card.height;
  background(w, h);

  round(edge, edgeY, w - 2 * edge, h - 2 * edgeY, 3, paperColor + Math.round(255 * Number($('opacity').value) / 100).toString(16).padStart(2, '0'));
  ctx.save();
  ctx.translate(outerX, fixed ? (h - plan.height * scale) / 2 : outerY);
  ctx.scale(scale, scale);
  if (tooLong) {
    ctx.font = '28px Pret';
    ctx.fillText('한 장에 담기에는 원문이 너무 길어요.', margin, 220)
  } else
    for (const {
        block,
        rows,
        bubble,
        label,
        top,
        height
      }
      of plans) {
      const person = people.get(block.who),
        color = person?.color || state.ink;
      const alignRight = bubble && person.right;
      let x = 0,
        baseline = top + size;
      if (label) {
        const labelRows = layout(block.who, nameSize, Infinity, [{
          text: block.who,
          bold: true
        }]);
        const labelWidth = labelRows[0].width;
        const fit = Math.min(1, inner / (labelWidth || 1));
        ctx.save();
        ctx.translate(alignRight ? inner - labelWidth * fit : 0, 0);
        ctx.scale(fit, 1);
        paintRows(labelRows, 0, top - 7, line, nameSize, color);
        ctx.restore();
      }
      if (bubble) {
        const width = Math.min(inner, Math.max(...rows.map(row => row.width)) + 2 * padX);
        if (alignRight) x = inner - width;
        round(x, top, width, height, Math.min(14, height / 2), person.bubble);
        x += padX;
        baseline += padY;
      }
      paintRows(rows, x, baseline, line, size, color);
    }
  ctx.restore();
  $('dimensions').textContent = w + ' × ' + h + ' px';
  ready = !!blocks.length && !tooLong && !missingPhoto;
  $('saveAll').disabled = !ready || packing;
  $('save').disabled = !ready;
  $('status').textContent = tooLong ? '원문 길이를 줄여주세요.' : missingPhoto ? '배경으로 사용할 사진을 선택해 주세요.' : !blocks.length ? '원문을 입력해 주세요.' : '';
}
const loaded = new Map();
const touchSave = matchMedia('(pointer:coarse)').matches || navigator.maxTouchPoints > 0;
let currentFile = null,
  batchFiles = null,
  buildingPhotos = false;

function schedule() {
  saveSettingsSoon();
  currentFile = null;
  batchFiles = null;
  $('gallery').disabled = true;
  $('galleryAll').disabled = true;
  $('galleryAll').textContent = '전체 사진 저장';
  rev++;
  ready = false;
  $('saveAll').disabled = true;
  $('save').disabled = true;
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(async () => {
    const ticket = rev,
      f = fonts[$('font').value];
    if (!loaded.has(f)) loaded.set(f, Promise.all([document.fonts.load('400 30px ' + f, '한글'), document.fonts.load('700 30px ' + f, '한글')]).catch(() => {}));
    await loaded.get(f);
    if (ticket !== rev) return;
    render();
    if (!touchSave || !ready) return;
    $('galleryAll').disabled = buildingPhotos;
    try {
      const png = await blob();
      if (ticket === rev) {
        currentFile = asPhoto(png, pageIndex);
        $('gallery').disabled = false
      }
    } catch {
      if (ticket === rev) $('status').textContent = '사진을 준비하지 못했어요.'
    }
  })
}

function blob() {
  return new Promise((resolve, reject) => card.toBlob(b => b ? resolve(b) : reject(Error()), 'image/png'))
}

function updatePageNav() {
  const multiple = pages.length > 1;
  $('pageNav').hidden = !multiple;
  $('gallery').hidden = !touchSave;
  $('galleryAll').hidden = !touchSave || !multiple;
  $('save').hidden = touchSave;
  $('saveAll').hidden = touchSave || !multiple;
  $('prevPage').disabled = pageIndex === 0;
  $('nextPage').disabled = pageIndex === pages.length - 1;
  $('pageCount').textContent = (pageIndex + 1) + ' / ' + pages.length + '장';
  $('save').textContent = '사진에 저장';
}
for (const [id, step] of [
    ['prevPage', -1],
    ['nextPage', 1]
  ]) {
  $(id).onclick = () => {
    pageIndex += step;
    updatePageNav();
    schedule()
  };
}

function fileName(index = pageIndex) {
  return pages.length === 1 ? '장면갈피.png' : '장면갈피-' + String(index + 1).padStart(String(pages.length).length + 1, '0') + '.png';
}

function download(data, name) {
  const url = URL.createObjectURL(data),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
$('save').onclick = async () => {
  if (!ready) return;
  try {
    const name = fileName();
    download(await blob(), name)
  } catch {
    $('status').textContent = 'PNG 생성에 실패했어요.'
  }
};
$('saveAll').onclick = async () => {
  if (!ready || packing) return;
  const ticket = rev,
    files = [];
  packing = true;
  $('saveAll').disabled = true;
  try {
    for (const [i, page] of pages.entries()) {
      if (ticket !== rev) throw Error('설정이 바뀌었어요. 다시 저장해 주세요.');
      render(page);
      if (!ready) throw Error((i + 1) + '장을 저장할 수 없어요. ' + $('status').textContent);
      const pending = blob();
      render();
      $('status').textContent = (i + 1) + ' / ' + pages.length + '장 저장 중';
      files.push({
        name: fileName(i),
        data: new Uint8Array(await (await pending).arrayBuffer())
      });
    }
    if (ticket !== rev) throw Error('설정이 바뀌었어요. 다시 저장해 주세요.');
    download(zipImages(files), '장면갈피.zip');
    $('status').textContent = '';
  } catch (error) {
    if (ticket === rev) render();
    $('status').textContent = error.message || '전체 저장에 실패했어요.';
  } finally {
    packing = false;
    $('saveAll').disabled = !ready
  }
};

function asPhoto(png, index) {
  return new File([png], fileName(index), {
    type: 'image/png'
  });
}
const photoUrls = [];
$('closePhotos').onclick = () => $('photoDialog').close();
$('photoDialog').onclose = () => {
  $('photoList').replaceChildren();
  photoUrls.splice(0).forEach(url => URL.revokeObjectURL(url));
};
async function sendPhotos(files) {
  try {
    if (navigator.canShare?.({
        files
      })) {
      await navigator.share({
        files
      });
      return
    }
  } catch (error) {
    if (error.name === 'AbortError') return
  }
  for (const file of files) {
    const img = new Image(),
      url = URL.createObjectURL(file);
    photoUrls.push(url);
    img.src = url;
    img.alt = file.name;
    $('photoList').append(img);
  }
  $('photoDialog').showModal();
}
$('gallery').onclick = () => {
  if (currentFile) sendPhotos([currentFile])
};
$('galleryAll').onclick = async () => {
  if (batchFiles) {
    $('status').textContent = '';
    await sendPhotos(batchFiles);
    return
  }
  if (!ready || buildingPhotos) return;
  const ticket = rev,
    files = [];
  buildingPhotos = true;
  $('galleryAll').disabled = true;
  try {
    for (const [index, page] of pages.entries()) {
      if (ticket !== rev) return;
      render(page);
      if (!ready) throw Error((index + 1) + '장을 저장할 수 없어요. ' + $('status').textContent);
      files.push(asPhoto(await blob(), index));
      if (ticket !== rev) return;
    }
    batchFiles = files;
    render();
    if (navigator.userActivation?.isActive) await sendPhotos(files);
    else $('status').textContent = '전체 사진 저장을 한 번 더 눌러 주세요.';
  } catch (error) {
    if (ticket === rev) {
      render();
      $('status').textContent = error.message || '사진을 준비하지 못했어요.'
    }
  } finally {
    buildingPhotos = false;
    $('galleryAll').disabled = !ready
  }
};

// ---- 설정 보관 ----
const savedControls = ['width', 'angle', 'size', 'margin', 'padding', 'opacity', 'tracking', 'stretch', 'spaceWidth', 'leading', 'paragraph', 'ratio', 'ratioX', 'ratioY', 'font'];
let settingsTimer = 0,
  settingsReady = false,
  currentNames = [];

function saveSettings() {
  clearTimeout(settingsTimer);
  if (!settingsReady) return;
  const values = {};
  for (const id of savedControls) values[id] = $(id).value;
  writeStore(settingsKey, {
    bg: state.bg,
    preset: state.preset,
    palette: state.palette,
    ink: state.ink,
    marker: state.marker,
    showNames: state.showNames,
    pad: state.pad,
    mode: state.mode,
    paper: paperColor,
    removeQuotes,
    colorSet: state.colorSet,
    people: Object.fromEntries(people),
    values
  });
}

function saveSettingsSoon() {
  clearTimeout(settingsTimer);
  settingsTimer = setTimeout(saveSettings, 200);
}
window.addEventListener('pagehide', saveSettings);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) saveSettings()
});

function restoreControls() {
  const values = savedSettings?.values;
  if (values && typeof values === 'object')
    for (const id of savedControls) {
      const el = $(id),
        v = values[id];
      if (typeof v !== 'string' && typeof v !== 'number') continue;
      if (id === 'font') {
        // 예전 '백묵 굴림' 선택은 합쳐진 '굴림'으로 옮긴다.
        const font = v === 'baekmuk' ? 'gulim' : String(v);
        if (fonts[font]) el.value = font;
      } else if (el.tagName === 'SELECT') {
        if ([...el.options].some(o => o.value === String(v))) el.value = String(v);
      } else if (Number.isFinite(Number(v))) el.value = String(v);
    }
  $('customRatio').hidden = $('ratio').value !== 'custom';
  removeQuotes = savedSettings?.removeQuotes === true;
  for (const b of document.querySelectorAll('.quote-toggle')) b.setAttribute('aria-pressed', String(removeQuotes));
  for (const b of $('modes').children) b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode));
  for (const b of $('pads').children) b.setAttribute('aria-pressed', String(Number(b.dataset.pad) === state.pad));
  $('names').setAttribute('aria-pressed', String(state.showNames));
  $('names').textContent = state.showNames ? '이름 표시 ✓' : '이름 표시';
  renderSets();
  settingsReady = true;
  prepareGulim();
}

// ---- 인물 색 세트 ----
function colorSets() {
  const sets = readStore(setsKey, []);
  return Array.isArray(sets) ? sets.filter(s => s && typeof s.name === 'string' && s.people && typeof s.people === 'object') : [];
}

function renderSets() {
  const select = $('setSelect'),
    sets = colorSets();
  if (state.colorSet && !sets.some(s => s.name === state.colorSet)) state.colorSet = '';
  select.replaceChildren(new Option('세트 선택', ''), ...sets.map(s => new Option(s.name, s.name)));
  select.value = state.colorSet;
  $('setDelete').disabled = !state.colorSet;
  resetSetDelete();
}

function snapshot(base = {}) {
  const out = {
    ...base
  };
  for (const n of currentNames) out[n] = {
    ...people.get(n)
  };
  return out;
}

function flash(b, text) {
  const original = b.dataset.label || b.textContent;
  b.dataset.label = original;
  b.textContent = text;
  setTimeout(() => b.textContent = original, 1200);
}
$('setSelect').onchange = () => {
  state.colorSet = $('setSelect').value;
  $('setNameRow').hidden = true;
  const set = colorSets().find(s => s.name === state.colorSet);
  if (set)
    for (const [name, v] of Object.entries(set.people)) {
      const p = cleanPerson(v);
      if (p) people.set(name, p);
    }
  renderSets();
  readBlocks();
};
$('setSave').onclick = () => {
  if (!state.colorSet) {
    $('setNameRow').hidden = false;
    $('setName').value = '';
    $('setName').focus();
    return;
  }
  const sets = colorSets(),
    set = sets.find(s => s.name === state.colorSet);
  if (!set) return renderSets();
  set.people = snapshot(set.people);
  writeStore(setsKey, sets);
  flash($('setSave'), '저장됨');
};

function createSet() {
  const name = $('setName').value.trim();
  if (!name) return $('setName').focus();
  const sets = colorSets(),
    old = sets.find(s => s.name === name);
  if (old) old.people = snapshot(old.people);
  else sets.push({
    name,
    people: snapshot()
  });
  writeStore(setsKey, sets);
  state.colorSet = name;
  $('setNameRow').hidden = true;
  renderSets();
  saveSettingsSoon();
  flash($('setSave'), '저장됨');
}
$('setNameOk').onclick = createSet;
$('setName').onkeydown = e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    createSet()
  } else if (e.key === 'Escape') $('setNameRow').hidden = true;
};
let setDeleteTimer = 0;

function resetSetDelete() {
  clearTimeout(setDeleteTimer);
  delete $('setDelete').dataset.armed;
  $('setDelete').textContent = '삭제';
}
$('setDelete').onclick = () => {
  if (!state.colorSet) return;
  const b = $('setDelete');
  if (!b.dataset.armed) {
    b.dataset.armed = '1';
    b.textContent = '한 번 더';
    setDeleteTimer = setTimeout(resetSetDelete, 3000);
    return;
  }
  writeStore(setsKey, colorSets().filter(s => s.name !== state.colorSet));
  state.colorSet = '';
  renderSets();
  saveSettingsSoon();
};
