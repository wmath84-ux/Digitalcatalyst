// The Music library's data contract, exercised as real code.
//
// `src/course/musicLibrary.ts` is deliberately pure — no React, no network —
// so every rule the owner asked for ("library ka koi bhi song chal jaye",
// "link paste karo to chal jaye", "jo chal hi nahi sakta us par saaf batao")
// can be proven here rather than by reading the source.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://learn.example.test' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;

const cache = new Map();

/** Transpile + run a repo source file the way Vite would, resolving relative imports. */
function load(file) {
  const resolved = path.resolve(file);
  if (cache.has(resolved)) return cache.get(resolved);
  const code = ts.transpileModule(fs.readFileSync(resolved, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  const resolve = (id) => {
    if (id.endsWith('.css')) return {};
    if (id.startsWith('.')) {
      const base = path.resolve(path.dirname(resolved), id);
      for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`]) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return load(candidate);
      }
      throw new Error(`cannot resolve ${id} from ${resolved}`);
    }
    return require(id);
  };
  new Function('require', 'module', 'exports', code)(resolve, mod, mod.exports);
  cache.set(resolved, mod.exports);
  return mod.exports;
}

const store = dom.window.localStorage;
const lib = load('src/course/musicLibrary.ts');
const embed = load('src/utils/courseEmbed.ts');

after(() => {
  dom.window.close();
  for (const handle of process._getActiveHandles?.() ?? []) {
    if (handle?.constructor?.name === 'MessagePort') handle.unref?.();
  }
});

test('a pasted YouTube link becomes a playable row in every shape people paste it', () => {
  const id = 'dQw4w9WgXcQ';
  const shapes = [
    `https://www.youtube.com/watch?v=${id}`,
    `https://www.youtube.com/watch?v=${id}&list=RD${id}&t=42s`,
    `https://youtu.be/${id}?si=abc`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/embed/${id}`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://music.youtube.com/watch?v=${id}`,
    id,
  ];
  for (const shape of shapes) {
    const track = lib.parseMusicLink(shape);
    assert.ok(track, `expected ${shape} to parse`);
    assert.equal(track.provider, 'youtube');
    assert.equal(track.url, `https://www.youtube.com/watch?v=${id}`);
    assert.equal(track.embedUrl, `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1&controls=1&fs=1&enablejsapi=1`);
    assert.equal(track.source, 'link');
  }
});

test('the YouTube embed is the SAME builder the course lessons use — never a second copy', () => {
  const fromLibrary = lib.youTubeEmbedUrl('dQw4w9WgXcQ');
  const fromLessons = embed.getCourseEmbed({
    id: 'lesson-1',
    name: 'Lesson',
    type: 'youtube',
    youtubeVideoId: 'dQw4w9WgXcQ',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  }, {}).url;
  assert.equal(fromLibrary, fromLessons);
  assert.equal(fromLibrary, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1&playsinline=1&controls=1&fs=1&enablejsapi=1');
});

test('Spotify links survive the locale prefix and every embeddable kind', () => {
  const track = lib.parseMusicLink('https://open.spotify.com/intl-de/track/4cOdK2wGLETKBW3PvgPWqT?si=abc');
  assert.equal(track.provider, 'spotify');
  assert.equal(track.embedUrl, 'https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT?utm_source=generator&theme=0');
  for (const kind of ['album', 'playlist', 'artist', 'episode', 'show']) {
    const row = lib.parseMusicLink(`https://open.spotify.com/${kind}/abc123`);
    assert.equal(row.provider, 'spotify');
    assert.match(row.embedUrl, new RegExp(`/embed/${kind}/abc123`));
  }
  // A bare origin is not a song — say so instead of storing a dead row.
  assert.equal(lib.parseMusicLink('https://open.spotify.com/'), null);
});

test('SoundCloud and direct audio files are recognised, with the host kept as the credit', () => {
  const cloud = lib.parseMusicLink('https://soundcloud.com/artist/that-one-song');
  assert.equal(cloud.provider, 'soundcloud');
  assert.match(cloud.embedUrl, /^https:\/\/w\.soundcloud\.com\/player\/\?url=https%3A%2F%2Fsoundcloud\.com%2Fartist%2Fthat-one-song/);
  assert.match(cloud.embedUrl, /auto_play=false/);

  const file = lib.parseMusicLink('https://archive.org/download/live-set/song-title.mp3?token=1');
  assert.equal(file.provider, 'audio');
  assert.equal(file.embedUrl, '');
  assert.equal(file.subtitle, 'archive.org');
  assert.equal(file.title, 'song title');

  const m4a = lib.parseMusicLink('https://cdn.example.test/music/My_Track-v2.m4a');
  assert.equal(m4a.provider, 'audio');
  assert.equal(m4a.title, 'My Track v2');
});

test('what cannot be played is refused, never stored as a dead row', () => {
  for (const input of ['', '   ', 'not a link', 'http://insecure.test/song.mp3', 'https://open.spotify.com', 'https://example.test/page.html', 'javascript:alert(1)', '//cdn.test/a.mp3']) {
    assert.equal(lib.parseMusicLink(input), null, `expected ${JSON.stringify(input)} to be refused`);
  }
  // Garbage of the wrong type must not throw either.
  for (const input of [null, undefined, 42, {}, [], true]) {
    assert.equal(lib.parseMusicLink(input), null);
  }
});

test('the shelf round-trips through storage, dedupes, and clears', () => {
  const uid = 'learner-1';
  store.clear();
  const first = lib.addMusicLink(uid, 'https://youtu.be/dQw4w9WgXcQ');
  assert.equal(first.tracks.length, 1);
  const again = lib.addMusicLink(uid, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=9s');
  assert.equal(again.tracks.length, 1, 'the same video added twice must stay ONE row');
  const second = lib.addMusicLink(uid, 'https://cdn.test/b.mp3');
  assert.equal(second.tracks.length, 2);
  assert.deepEqual(lib.loadMusicLinks(uid).map((row) => row.id), second.tracks.map((row) => row.id));

  // A refusal returns null and writes nothing.
  const before = store.getItem(lib.musicLibraryKey(uid));
  assert.equal(lib.addMusicLink(uid, 'https://example.test/nope'), null);
  assert.equal(store.getItem(lib.musicLibraryKey(uid)), before);

  const after = lib.removeMusicLink(uid, second.track.id);
  assert.equal(after.length, 1);
  assert.equal(lib.loadMusicLinks(uid).length, 1);

  // Libraries are per learner — a second account on the same device sees its own.
  assert.equal(lib.loadMusicLinks('learner-2').length, 0);
});

test('a corrupt or foreign payload never reaches the pane', () => {
  const uid = 'learner-3';
  store.clear();
  store.setItem(lib.musicLibraryKey(uid), JSON.stringify({
    version: 1,
    tracks: [
      { id: 'good', provider: 'audio', title: 'Good', subtitle: 'x', url: 'https://cdn.test/good.mp3', embedUrl: '', source: 'link', addedAt: 1 },
      { id: 'bad-provider', provider: 'jiosaavn', title: 'Scraped', url: 'https://a.test/x.mp3' },
      { id: 'insecure', provider: 'audio', title: 'HTTP', url: 'http://a.test/x.mp3' },
      { id: 'empty', provider: 'youtube', title: 'Nothing', url: '', embedUrl: '' },
      null,
      'nope',
    ],
  }));
  const rows = lib.loadMusicLinks(uid);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'good');

  // And broken JSON is simply an empty shelf, not a crash.
  store.setItem(lib.musicLibraryKey(uid), '{not json');
  assert.deepEqual(lib.loadMusicLinks(uid), []);
});

test('storage that refuses writes is reported, never thrown', () => {
  const uid = 'learner-4';
  const realLocalStorage = store;
  Object.defineProperty(globalThis.window, 'localStorage', {
    configurable: true,
    get() { throw new Error('QuotaExceededError'); },
  });
  assert.equal(lib.saveMusicLinks(uid, []), false);
  assert.deepEqual(lib.loadMusicLinks(uid), []);
  assert.equal(lib.loadLastMusic(uid), null);
  assert.doesNotThrow(() => lib.saveLastMusic(uid, null));
  Object.defineProperty(globalThis.window, 'localStorage', { configurable: true, value: realLocalStorage });
});

test('the last song a learner played comes back with the pane', () => {
  const uid = 'learner-5';
  store.clear();
  assert.equal(lib.loadLastMusic(uid), null);
  const track = lib.parseMusicLink('https://cdn.test/remember-me.mp3');
  lib.saveLastMusic(uid, track);
  assert.equal(lib.loadLastMusic(uid)?.title, 'remember me');
  lib.saveLastMusic(uid, null);
  assert.equal(lib.loadLastMusic(uid), null);
});

test('the course shelf is the course tree, access-scoped, with the module path as the credit', () => {
  const modules = [
    {
      id: 'm1',
      title: 'Basics',
      accessLevel: 'included',
      files: [
        { id: 'f1', name: 'Intro theme', type: 'audio', url: 'https://cdn.test/intro.mp3' },
        { id: 'f2', name: 'Slides', type: 'pdf', url: 'https://cdn.test/a.pdf' },
        { id: 'f3', name: 'Hidden track', type: 'audio', url: 'https://cdn.test/hidden.mp3', accessLevel: 'hidden' },
        { id: 'f4', name: 'No url', type: 'audio' },
      ],
      modules: [{
        id: 'm1a',
        title: 'Deeper',
        accessLevel: 'included',
        files: [{ id: 'f5', name: 'Nested song', type: 'audio', url: 'https://cdn.test/nested.mp3' }],
      }],
    },
    { id: 'm2', title: 'Secret', accessLevel: 'hidden', files: [{ id: 'f6', name: 'Nope', type: 'audio', url: 'https://cdn.test/nope.mp3' }] },
    { id: 'm3', title: 'Paid pack', accessLevel: 'included', files: [{ id: 'f7', name: 'Locked song', type: 'audio', url: 'https://cdn.test/locked.mp3' }] },
  ];
  const rows = lib.collectCourseAudio(modules, new Set(['m1', 'm1a']));
  assert.deepEqual(rows.map((row) => row.id), ['course-f1', 'course-f5']);
  assert.equal(rows[0].subtitle, 'Basics');
  assert.equal(rows[1].subtitle, 'Basics · Deeper');
  assert.ok(rows.every((row) => row.source === 'course' && row.provider === 'audio' && row.embedUrl === ''));
  // Without an access set, only `hidden` is skipped — the caller decides gating.
  assert.deepEqual(lib.collectCourseAudio(modules).map((row) => row.id), ['course-f1', 'course-f5', 'course-f7']);
  assert.deepEqual(lib.collectCourseAudio([]), []);
});

test('a file off the device is judged before a single byte is stored', () => {
  assert.match(lib.musicUploadIssue(null), /Choose an audio file/);
  assert.match(lib.musicUploadIssue({ name: 'a.mp3', size: 0, type: 'audio/mpeg' }), /empty/);
  assert.match(lib.musicUploadIssue({ name: 'huge.mp3', size: lib.MUSIC_UPLOAD_MAX_BYTES + 1, type: 'audio/mpeg' }), /capped at 60 MB/);
  assert.match(lib.musicUploadIssue({ name: 'notes.txt', size: 20, type: 'text/plain' }), /not audio/);
  assert.equal(lib.musicUploadIssue({ name: 'song.mp3', size: 1024, type: 'audio/mpeg' }), null);
  // A browser that reports no MIME still gets a real file through, on its extension.
  assert.equal(lib.musicUploadIssue({ name: 'song.FLAC', size: 2048, type: '' }), null);
  assert.equal(lib.musicUploadIssue({ name: 'voice.ogg', size: 99, type: 'application/octet-stream' }), null);
});

test('library labels and filters read the way the rows show them', () => {
  const course = { id: 'a', provider: 'audio', title: 'Course song', subtitle: 'Basics', url: 'https://c.test/a.mp3', embedUrl: '', source: 'course', addedAt: 0 };
  const upload = { id: 'b', provider: 'audio', title: 'My song', subtitle: 'Audio file', url: '', embedUrl: '', source: 'upload', addedAt: 0, localId: 'b' };
  const link = { id: 'c', provider: 'youtube', title: 'Video song', subtitle: 'YouTube', url: 'https://youtu.be/x', embedUrl: 'https://www.youtube-nocookie.com/embed/x', source: 'link', addedAt: 0 };
  assert.equal(lib.musicRowBadge(course), 'Course');
  assert.equal(lib.musicRowBadge(upload), 'My file');
  assert.equal(lib.musicRowBadge(link), 'YouTube');
  assert.deepEqual(lib.filterMusicTracks([course, upload, link], 'song').map((row) => row.id), ['a', 'b', 'c']);
  assert.deepEqual(lib.filterMusicTracks([course, upload, link], 'youtube').map((row) => row.id), ['c']);
  assert.deepEqual(lib.filterMusicTracks([course, upload, link], '   ').length, 3);
  assert.deepEqual(lib.filterMusicTracks([course, upload, link], 'zzz'), []);
  assert.equal(lib.describeMusicProvider('soundcloud'), 'SoundCloud');
  assert.equal(lib.describeMusicProvider('audio'), 'Audio file');
});

test('names, ids and URLs are sanitised the same way every time', () => {
  assert.equal(lib.sanitizeMusicName('  a/b\\c\u0000d \n e '), 'a b c d e');
  assert.equal(lib.sanitizeMusicName(''), 'Untitled song');
  assert.equal(lib.sanitizeMusicName('x'.repeat(200)).length, 90);
  assert.equal(lib.sanitizeMusicUrl('http://a.test/x'), '');
  assert.equal(lib.sanitizeMusicUrl('https://a.test/x'), 'https://a.test/x');
  assert.equal(lib.sanitizeMusicUrl('a.test/x'), '');
  assert.equal(lib.createMusicId('youtube:abc'), lib.createMusicId('youtube:abc'));
  assert.notEqual(lib.createMusicId('youtube:abc'), lib.createMusicId('youtube:abd'));
  assert.match(lib.createMusicId('!!'), /^track-/);
});
