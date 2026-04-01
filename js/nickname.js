// Nickname generator: auto-assigns "adjective + noun + #number" nicknames
(function () {
  'use strict';

  window.YachtGame = window.YachtGame || {};

  var ADJECTIVES = {
    ko: [
      '귀여운', '용감한', '빠른', '조용한', '똑똑한',
      '신나는', '멋진', '작은', '큰', '밝은',
      '따뜻한', '시원한', '강한', '즐거운', '씩씩한',
      '활발한', '재밌는', '느긋한', '날쌘', '영리한',
      '당당한', '상냥한', '든든한', '행복한', '유쾌한',
      '대담한', '단단한', '소중한', '반짝이는', '부드러운'
    ],
    en: [
      'Bold', 'Brave', 'Cool', 'Fast', 'Kind',
      'Lucky', 'Quick', 'Sharp', 'Smart', 'Calm',
      'Happy', 'Jolly', 'Keen', 'Neat', 'Shy',
      'Sly', 'Warm', 'Wise', 'Wild', 'Zany',
      'Agile', 'Swift', 'Proud', 'Tiny', 'Fair',
      'Grand', 'Merry', 'Noble', 'Vivid', 'Witty'
    ]
  };

  var NOUNS = {
    ko: [
      '다람쥐', '고양이', '강아지', '토끼', '펭귄',
      '여우', '호랑이', '곰', '독수리', '돌고래',
      '사자', '판다', '올빼미', '수달', '앵무새',
      '기린', '거북이', '하마', '물범', '오리',
      '참새', '매', '늑대', '사슴', '두루미',
      '표범', '오소리', '나비', '코알라', '햄스터'
    ],
    en: [
      'Fox', 'Owl', 'Cat', 'Bear', 'Deer',
      'Wolf', 'Hawk', 'Dove', 'Seal', 'Puma',
      'Lion', 'Lynx', 'Swan', 'Crow', 'Hare',
      'Wren', 'Moth', 'Pike', 'Lark', 'Vole',
      'Mink', 'Jay', 'Ram', 'Orca', 'Colt',
      'Fawn', 'Dace', 'Koi', 'Toad', 'Newt'
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

  function ensureNickname(uid, callback) {
    var db = window.YachtGame.db;
    var ref = db.ref('users/' + uid + '/nickname');

    ref.once('value').then(function (snap) {
      if (snap.exists()) {
        callback(snap.val());
      } else {
        var I18n = window.YachtGame.I18n;
        var lang = (I18n && I18n.getLang) ? I18n.getLang() : 'en';
        var nick = generate(uid, lang);
        ref.set(nick).then(function () {
          callback(nick);
        }).catch(function () {
          // If write fails, still return the generated nickname for this session
          callback(nick);
        });
      }
    }).catch(function () {
      // DB read failed — generate locally for this session
      var I18n = window.YachtGame.I18n;
      var lang = (I18n && I18n.getLang) ? I18n.getLang() : 'en';
      callback(generate(uid, lang));
    });
  }

  window.YachtGame.Nickname = {
    generate: generate,
    ensureNickname: ensureNickname
  };
})();
