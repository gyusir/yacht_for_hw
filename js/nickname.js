// Nickname generator: auto-assigns "adjective + noun + #number" nicknames
(function () {
  'use strict';

  window.YachtGame = window.YachtGame || {};

  // Index-aligned: ko[i] and en[i] have the same meaning
  var ADJECTIVES = {
    ko: [
      '용감한',   // 0  Brave
      '빠른',     // 1  Swift
      '똑똑한',   // 2  Smart
      '조용한',   // 3  Calm
      '귀여운',   // 4  Cute
      '행복한',   // 5  Happy
      '강한',     // 6  Tough
      '밝은',     // 7  Vivid
      '멋진',     // 8  Cool
      '날쌘',     // 9  Quick
      '따뜻한',   // 10 Warm
      '영리한',   // 11 Witty
      '대담한',   // 12 Bold
      '당당한',   // 13 Proud
      '씩씩한',   // 14 Hardy
      '작은',     // 15 Tiny
      '느긋한',   // 16 Mellow
      '상냥한',   // 17 Kind
      '즐거운',   // 18 Jolly
      '유쾌한',   // 19 Merry
      '신비한',   // 20 Mystic
      '활발한',   // 21 Peppy
      '재밌는',   // 22 Funny
      '든든한',   // 23 Solid
      '부드러운', // 24 Gentle
      '소중한',   // 25 Dear
      '단단한',   // 26 Firm
      '시원한',   // 27 Fresh
      '신나는',   // 28 Eager
      '반짝이는'  // 29 Shiny
    ],
    en: [
      'Brave',  'Swift',  'Smart',  'Calm',   'Cute',
      'Happy',  'Tough',  'Vivid',  'Cool',   'Quick',
      'Warm',   'Witty',  'Bold',   'Proud',  'Hardy',
      'Tiny',   'Mellow', 'Kind',   'Jolly',  'Merry',
      'Mystic', 'Peppy',  'Funny',  'Solid',  'Gentle',
      'Dear',   'Firm',   'Fresh',  'Eager',  'Shiny'
    ]
  };

  var NOUNS = {
    ko: [
      '여우',     // 0  Fox
      '올빼미',   // 1  Owl
      '고양이',   // 2  Cat
      '곰',       // 3  Bear
      '사슴',     // 4  Deer
      '늑대',     // 5  Wolf
      '매',       // 6  Hawk
      '비둘기',   // 7  Dove
      '물범',     // 8  Seal
      '퓨마',     // 9  Puma
      '사자',     // 10 Lion
      '백조',     // 11 Swan
      '토끼',     // 12 Rabbit
      '참새',     // 13 Sparrow
      '펭귄',     // 14 Penguin
      '수달',     // 15 Otter
      '호랑이',   // 16 Tiger
      '판다',     // 17 Panda
      '돌고래',   // 18 Dolphin
      '독수리',   // 19 Eagle
      '다람쥐',   // 20 Squirrel
      '강아지',   // 21 Puppy
      '앵무새',   // 22 Parrot
      '코알라',   // 23 Koala
      '기린',     // 24 Giraffe
      '거북이',   // 25 Turtle
      '햄스터',   // 26 Hamster
      '나비',     // 27 Butterfly
      '오리',     // 28 Duck
      '두루미'    // 29 Crane
    ],
    en: [
      'Fox',      'Owl',      'Cat',       'Bear',     'Deer',
      'Wolf',     'Hawk',     'Dove',      'Seal',     'Puma',
      'Lion',     'Swan',     'Rabbit',    'Sparrow',  'Penguin',
      'Otter',    'Tiger',    'Panda',     'Dolphin',  'Eagle',
      'Squirrel', 'Puppy',    'Parrot',    'Koala',    'Giraffe',
      'Turtle',   'Hamster',  'Butterfly', 'Duck',     'Crane'
    ]
  };

  // djb2 hash - deterministic string hash
  function djb2(str) {
    var hash = 5381;
    for (var i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
      hash = hash & 0x7fffffff; // keep positive 31-bit
    }
    return hash;
  }

  function generate(uid, lang) {
    var adjList = ADJECTIVES[lang] || ADJECTIVES.en;
    var nounList = NOUNS[lang] || NOUNS.en;

    var h1 = djb2(uid + ':adj');
    var h2 = djb2(uid + ':noun');
    var h3 = djb2(uid + ':num');

    var adj = adjList[h1 % adjList.length];
    var noun = nounList[h2 % nounList.length];
    var num = (h3 % 99) + 1; // 1~99

    return adj + ' ' + noun + '#' + num;
  }

  // Generate both ko and en nicknames for a uid
  function generateBoth(uid) {
    return {
      ko: generate(uid, 'ko'),
      en: generate(uid, 'en')
    };
  }

  // Generate guest nickname: "adjective + Guest + #number"
  function generateGuest(uid) {
    var h1 = djb2(uid + ':adj');
    var h3 = djb2(uid + ':num');
    var adjIdx = h1 % ADJECTIVES.ko.length;
    var num = (h3 % 99) + 1;
    return {
      ko: ADJECTIVES.ko[adjIdx] + ' ' + '\uac8c\uc2a4\ud2b8' + '#' + num,
      en: ADJECTIVES.en[adjIdx] + ' Guest#' + num
    };
  }

  // Ensure both nickname_ko and nickname_en exist in DB; returns { ko, en }
  function ensureNickname(uid, callback) {
    var db = window.YachtGame.db;
    var userRef = db.ref('users/' + uid);

    userRef.once('value').then(function (snap) {
      var data = snap.val() || {};
      var ko = data.nickname_ko;
      var en = data.nickname_en;

      if (ko && en) {
        callback({ ko: ko, en: en });
      } else {
        // Generate missing nicknames
        var generated = generateBoth(uid);
        var updates = {};
        if (!ko) { ko = generated.ko; updates.nickname_ko = ko; }
        if (!en) { en = generated.en; updates.nickname_en = en; }

        // Also migrate old single nickname field if present
        if (data.nickname) {
          updates.nickname = null; // remove legacy field
        }

        userRef.update(updates).then(function () {
          callback({ ko: ko, en: en });
        }).catch(function () {
          callback({ ko: ko, en: en });
        });
      }
    }).catch(function () {
      // DB read failed — generate locally for this session
      var generated = generateBoth(uid);
      callback(generated);
    });
  }

  window.YachtGame.Nickname = {
    generate: generate,
    generateBoth: generateBoth,
    generateGuest: generateGuest,
    ensureNickname: ensureNickname
  };
})();
