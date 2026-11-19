/*!
 * GameTracker - add to any of your games to record player data in your
 * Firebase database. The owner dashboard (admin/index.html) shows it all.
 *
 *   <script src="firebase-config.js"></script>
 *   <script src="tracker.js"></script>
 *
 *   GameTracker.setPlayer('Mia');                         // when the child enters a name
 *   GameTracker.addStars(1, 'letters');                   // reward stars
 *   GameTracker.saveProgress('letters', { level: 3 });    // where they are in a game
 *   GameTracker.logEvent('letters', 'answer', { letter: 'B', correct: true });
 *
 * Everything is also kept in localStorage, so the game keeps working if the
 * database is unreachable or not configured yet.
 */
(function (global) {
  'use strict';

  var SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  var LS_KEY = 'gt_player_v1';
  var MAX_QUEUE = 200;

  var pending = [];
  var status = 'connecting'; // connecting | online | local-only | error
  var listeners = [];
  var db = null;
  var uid = null;

  var local = readLocal();

  function readLocal() {
    try {
      var s = JSON.parse(localStorage.getItem(LS_KEY));
      if (s && typeof s === 'object') {
        s.progress = s.progress && typeof s.progress === 'object' ? s.progress : {};
        s.stars = Number(s.stars) || 0;
        s.name = typeof s.name === 'string' ? s.name : '';
        return s;
      }
    } catch (e) { /* ignore */ }
    return { name: '', stars: 0, progress: {} };
  }

  function writeLocal() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(local)); } catch (e) { /* ignore */ }
  }

  function setStatus(s) {
    status = s;
    listeners.forEach(function (cb) { try { cb(s); } catch (e) { /* ignore */ } });
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var el = document.createElement('script');
      el.src = src;
      el.onload = resolve;
      el.onerror = function () { reject(new Error('Could not load ' + src)); };
      document.head.appendChild(el);
    });
  }

  function cleanName(name) {
    return String(name == null ? '' : name).replace(/\s+/g, ' ').trim().slice(0, 40);
  }

  function cleanKey(key) {
    return String(key == null ? '' : key).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 40) || 'game';
  }

  function plain(data) {
    try { return JSON.parse(JSON.stringify(data == null ? {} : data)); } catch (e) { return {}; }
  }

  function ts() { return firebase.firestore.FieldValue.serverTimestamp(); }
  function playerRef() { return db.collection('players').doc(uid); }

  // Run a database task now, or as soon as the connection is ready.
  function run(task) {
    if (status === 'local-only' || status === 'error') return;
    if (status === 'online') {
      task().catch(function (err) { console.warn('[GameTracker]', err && err.message); });
      return;
    }
    pending.push(task);
    if (pending.length > MAX_QUEUE) pending.shift();
  }

  function flush() {
    var tasks = pending;
    pending = [];
    tasks.forEach(function (task) {
      task().catch(function (err) { console.warn('[GameTracker]', err && err.message); });
    });
  }

  function connect() {
    var cfg = global.FIREBASE_CONFIG;
    if (!cfg || !cfg.apiKey || String(cfg.apiKey).indexOf('PASTE') === 0) {
      console.warn('[GameTracker] Firebase is not configured yet - data is kept on this device only.');
      setStatus('local-only');
      return;
    }

    loadScript(SDK + 'firebase-app-compat.js')
      .then(function () {
        return Promise.all([
          loadScript(SDK + 'firebase-auth-compat.js'),
          loadScript(SDK + 'firebase-firestore-compat.js')
        ]);
      })
      .then(function () {
        firebase.initializeApp(cfg, 'tracker');
        var app = firebase.app('tracker');
        db = app.firestore();
        return app.auth().signInAnonymously();
      })
      .then(function (cred) {
        uid = cred.user.uid;
        return playerRef().get();
      })
      .then(function (snap) {
        var base = { lastSeen: ts(), sessions: firebase.firestore.FieldValue.increment(1) };
        if (snap.exists) {
          var d = snap.data() || {};
          if (!local.name && d.name) local.name = String(d.name);
          if (typeof d.stars === 'number' && d.stars > local.stars) local.stars = d.stars;
          if (d.progress && typeof d.progress === 'object') {
            Object.keys(d.progress).forEach(function (k) {
              if (!(k in local.progress)) local.progress[k] = d.progress[k];
            });
          }
          writeLocal();
        } else {
          base.firstSeen = ts();
          base.name = local.name || '';
          base.stars = local.stars || 0;
          base.progress = plain(local.progress);
        }
        return playerRef().set(base, { merge: true });
      })
      .then(function () {
        setStatus('online');
        flush();
      })
      .catch(function (err) {
        console.warn('[GameTracker] Could not connect:', err && err.message);
        pending = [];
        setStatus('error');
      });
  }

  var api = {
    /** 'connecting' | 'online' | 'local-only' | 'error' */
    getStatus: function () { return status; },

    /** Call back now and whenever the connection status changes. */
    onStatus: function (cb) { listeners.push(cb); cb(status); },

    getPlayer: function () {
      return { name: local.name, stars: local.stars, progress: plain(local.progress) };
    },

    setPlayer: function (name) {
      local.name = cleanName(name);
      writeLocal();
      var value = local.name;
      run(function () { return playerRef().set({ name: value, lastSeen: ts() }, { merge: true }); });
      return local.name;
    },

    addStars: function (n, game) {
      n = Math.round(Number(n)) || 0;
      local.stars = Math.max(0, local.stars + n);
      writeLocal();
      var total = local.stars;
      run(function () { return playerRef().set({ stars: total, lastSeen: ts() }, { merge: true }); });
      if (game) api.logEvent(game, 'stars', { earned: n, total: total });
      return total;
    },

    saveProgress: function (game, data) {
      var key = cleanKey(game);
      var value = plain(data);
      var merged = plain(local.progress[key]);
      Object.keys(value).forEach(function (k) { merged[k] = value[k]; });
      local.progress[key] = merged;
      writeLocal();
      var patch = {};
      patch[key] = merged;
      run(function () { return playerRef().set({ progress: patch, lastSeen: ts() }, { merge: true }); });
    },

    logEvent: function (game, type, data) {
      var g = cleanKey(game);
      var t = String(type == null ? 'event' : type).slice(0, 60);
      var d = plain(data);
      run(function () {
        return playerRef().collection('events').add({ game: g, type: t, data: d, at: ts() });
      });
    }
  };

  global.GameTracker = api;
  connect();
})(window);
