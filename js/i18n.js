// Internationalization module: English/Korean dual language support
(function () {
  'use strict';

  window.YachtGame = window.YachtGame || {};

  var STRINGS = {
    en: {
      // Login
      welcome: 'Welcome',
      welcome_tagline: 'Welcome to Yacht Dice, the ultimate dice showdown.\nIf you win, it\'s skill. If you lose, it\'s just a mistake.',
      sign_in_desc: 'Sign in to save your game history, or play as a guest.',
      guest_name_placeholder: 'Guest name',
      play_as_guest: 'Play as Guest',
      sign_in_google: 'Sign in with Google',
      google_disclaimer: '*A nickname is automatically assigned on Google sign-in. Your real name will not be shown.',
      sign_out: 'Sign out',
      continue_btn: 'Continue',

      // Lobby
      lobby: 'Lobby',
      lobby_desc: 'Create a new room or join an existing one.',
      enter_room_code: 'Room code',
      join: 'Join',
      or: 'or',
      create_room: 'Create\nRoom',
      random_match: 'Random\nMatch',
      play_vs_bot: '\uD83E\uDD16 Bot\nMatch',
      dice_skin: 'Dice Skin',
      skin_unlock_hint: 'Play games to unlock skins. Beat bots to claim theirs.',
      skin_play_unlock: '\uD83C\uDFB2 Play to Unlock',
      skin_bot_unlock: '\uD83E\uDD16 Win Bot to Unlock',
      skin_unlocked_count: 'unlocked',
      skin_games_count: 'games',
      skin_wins_count: 'wins',
      skin_vs_bot: 'vs',
      skin_streak: 'streak',
      my_stats: '\uD83D\uDCCA Stats',
      back_to_login: 'Back to Login',
      feedback: 'Feedback',
      session_notice: '* Closing the tab ends the session.\n  Keep the tab open to stay connected.',

      // History
      recent_games: 'Recent Games',
      back_to_lobby: 'Back to Lobby',
      games: 'Games',
      wins: 'Wins',
      losses: 'Losses',
      ties: 'Ties',
      win_rate: 'Win Rate',
      no_games: 'No games played yet.',
      result_w: 'W',
      result_l: 'L',
      result_t: 'T',
      result_inv: 'INV',
      result_criteria_title: 'Result Criteria',
      result_w_label: 'Win',
      result_l_label: 'Loss',
      result_t_label: 'Tie',
      result_inv_label: 'Invalid',
      result_criteria_win: 'Higher score or opponent forfeit',
      result_criteria_loss: 'Lower score or forfeit',
      result_criteria_tie: 'Same score or mutual agreement',
      result_criteria_invalid: 'Below min score (Yacht 50 / Yahtzee 100) or game under 2 min',
      result_criteria_invalid2: 'Invalid games not counted in win rate',
      mode_yacht: 'Yacht',
      mode_yahtzee: 'Yahtzee',
      date: 'Date',
      mode: 'Mode',
      opponent: 'Opponent',
      score: 'Score',
      result: 'Result',

      // Waiting Room
      waiting_room: 'Waiting Room',
      share_code: 'Share this code with your friend:',
      select_game_mode: 'Select game mode:',
      yahtzee_desc: '13 categories, bonus scoring',
      yacht_desc: '12 categories, classic rules',
      waiting_for_opponent: 'Waiting for opponent...',
      back_to_lobby_arrow: '\u2190 Back to Lobby',
      random_match: 'Random Match',
      random_match_title: 'Random Match',
      random_searching: 'Searching for an opponent...',
      random_matched: 'Opponent found!',
      find_opponent: 'Find Opponent',
      any_mode: 'Any',
      any_mode_desc: 'Match with any game mode',

      // Bot Setup
      bot_game: 'Bot Game',
      basic: 'Basic',
      gambler: 'Gambler',
      basic_bot: 'Basic Bot',
      gambler_bot: 'Gambler Bot',
      basic_desc: 'Moderate level AI',
      gambler_desc: 'Optimized strategy AI',
      wave: 'Wave',
      wave_bot: 'Wave Bot',
      wave_desc: 'Win-rate maximizing AI',
      start_game: 'Start Game',

      // Game
      btn_shortcut: 'Shortcut',
      btn_rule: 'Rule',
      btn_draw: 'Draw',
      btn_quit: 'Quit',
      title_yacht: 'Yacht Dice',
      title_yahtzee: 'Yahtzee Dice',
      shortcut_title: 'PC Shortcuts',
      rule_title: 'Rules',
      leave_title: 'Leave',
      lets_roll: "Let's Roll!",
      roll_end: 'Roll End',
      foes_turn: "Foe's turn",
      category: 'Category',
      bonus: 'Bonus',
      yahtzee_bonus: 'Yahtzee Bonus',
      total: 'Total',
      confirm_hint: 'Tap again to confirm',

      // Game Over
      you_win: 'You Win!',
      you_lose: 'You Lose',
      its_a_tie: "It's a Tie!",
      player: 'Player',
      new_game: 'New Game',

      // Disconnect
      opponent_disconnected: 'Opponent disconnected. Waiting for reconnection...',
      auto_win_in: 'Auto-win in',

      // Leave confirm
      confirm_leave_bot: 'Leave bot game? This counts as a loss.',
      confirm_leave_online: 'Really leave? Your opponent wins.',
      confirm_yes: 'Yes',
      confirm_no: 'Cancel',

      // Toast messages
      toast_duplicate_tab: 'New game started in another tab.',
      toast_signin_failed: 'Sign-in failed',
      toast_unknown_error: 'Unknown error',
      toast_joined_room: 'Joined room',
      toast_name_required: 'Please set a name first.',
      toast_code_copied: 'Code copied!',
      toast_reconnected: 'Reconnected to game!',
      toast_player_joined: 'joined!',
      toast_room_not_found: 'Room not found.',
      toast_room_full: 'Room is full.',
      toast_room_in_game: 'Room is already in a game.',
      toast_create_failed: 'Failed to create room.',
      toast_join_failed: 'Failed to join room.',
      toast_random_failed: 'Random match failed.',
      toast_rate_limit: 'Too many requests. Please wait.',

      // Draw
      draw_proposal_msg: 'Opponent proposes a draw. Accept?',
      draw_proposed: 'Draw proposed. Waiting for response...',
      bot_no_draw: 'Robots don\'t know what a draw is 🤖',
      draw_declined: 'Opponent declined the draw.',
      accept: 'Accept',
      decline: 'Decline',

      // Category names
      cat_ones: 'Ones',
      cat_twos: 'Twos',
      cat_threes: 'Threes',
      cat_fours: 'Fours',
      cat_fives: 'Fives',
      cat_sixes: 'Sixes',
      cat_choice: 'Choice',
      cat_chance: 'Chance',
      cat_threeOfAKind: 'Three of a Kind',
      cat_fourOfAKind: 'Four of a Kind',
      cat_fullHouse: 'Full House',
      cat_smallStraight: 'Sm. Straight',
      cat_largeStraight: 'Lg. Straight',
      cat_yacht: 'Yacht',
      cat_yahtzee: 'Yahtzee',

      // Rules - Yacht
      rules_yacht_title: 'Yacht Rules',
      rules_cat: 'Category',
      rules_score: 'Score',
      rules_ones_sixes: 'Ones ~ Sixes',
      rules_ones_sixes_desc: 'Sum of matching dice',
      rules_foak: 'Four of a Kind',
      rules_foak_desc: 'Sum of 4 matching dice',
      rules_fh: 'Full House',
      rules_fh_desc: '3+2 combo \u2192 sum of all',
      rules_ss_yacht: 'Small Straight',
      rules_ss_yacht_desc: '1-2-3-4-5 \u2192 30 pts',
      rules_ls_yacht: 'Large Straight',
      rules_ls_yacht_desc: '2-3-4-5-6 \u2192 30 pts',
      rules_choice: 'Choice',
      rules_choice_desc: 'Sum of all dice',
      rules_yacht: 'Yacht',
      rules_yacht_desc: '5 of a kind \u2192 50 pts',
      rules_yacht_note: 'Max 3 rolls per turn. Click dice to hold/release.',

      // Rules - Yahtzee
      rules_yahtzee_title: 'Yahtzee Rules',
      rules_toak: 'Three of a Kind',
      rules_toak_desc: '3+ matching \u2192 sum of all',
      rules_foak_yahtzee_desc: '4+ matching \u2192 sum of all',
      rules_fh_yahtzee: 'Full House',
      rules_fh_yahtzee_desc: '3+2 combo \u2192 25 pts',
      rules_ss_yahtzee: 'Small Straight',
      rules_ss_yahtzee_desc: '4 in a row \u2192 30 pts',
      rules_ls_yahtzee: 'Large Straight',
      rules_ls_yahtzee_desc: '5 in a row \u2192 40 pts',
      rules_yahtzee_cat: 'Yahtzee',
      rules_yahtzee_cat_desc: '5 of a kind \u2192 50 pts',
      rules_chance: 'Chance',
      rules_chance_desc: 'Sum of all dice',
      rules_yahtzee_bonus_note: 'Upper sum \u2265 63 \u2192 +35 bonus\nExtra Yahtzee \u2192 +100 bonus each',
      rules_yahtzee_note: 'Max 3 rolls per turn. Click dice to hold/release.',

      // Shortcut overlay
      shortcut_title_overlay: 'PC Shortcut',
      shortcut_key: 'Key',
      shortcut_action: 'Action',
      shortcut_dice: 'Hold/release dice',
      shortcut_emote: 'Send quick emote',
      shortcut_nav: 'Navigate categories & Roll',
      shortcut_confirm: 'Confirm / Roll',

      // Tutorial
      tutorial: 'Tutorial',
      tutorial_btn: '\ud83d\udcd6 Tutorial',
      tut_intro: 'Welcome to Yacht Dice! Let\'s learn how to play.',
      tut_scorecard: 'This is the scorecard. Fill all categories to finish the game.',
      tut_dice: 'These are your 5 dice and the Roll button.\nYou get 3 rolls per turn.',
      tut_roll: 'Click the Roll button to throw the dice!',
      tut_hold: 'Click a die to hold it!\nHeld dice won\'t be re-rolled.',
      tut_reroll: 'Roll again! Notice that held dice stay the same.',
      tut_scoring: 'Now pick a category to score. Tap once to preview, tap again to confirm.',
      tut_summary: 'Great! You know the basics. Try playing against a bot to practice!',
      tut_next: 'Next',
      tut_skip: 'Skip Tutorial',
      tut_skip_short: 'Skip',
      tut_start_playing: 'Home',
      tut_you: 'You',
      tut_opponent: 'Opponent'
    },

    ko: {
      // Login
      welcome: '\ud658\uc601\ud569\ub2c8\ub2e4',
      welcome_tagline: '\ucd5c\uace0\uc758 \ub0b4\uae30 \uac8c\uc784 \uc694\ud2b8\ub2e4\uc774\uc2a4\uc5d0 \uc624\uc2e0 \uac83\uc744 \ud658\uc601\ud574\uc694.\n\uc774\uae30\uba74 \uc2e4\ub825\uc774\uace0, \uc9c0\uba74 \uc2e4\uc218\uc785\ub2c8\ub2e4.',
      sign_in_desc: '\uac8c\uc784 \uae30\ub85d\uc744 \uc800\uc7a5\ud558\ub824\uba74 \ub85c\uadf8\uc778\ud558\uc138\uc694.\n\uac8c\uc2a4\ud2b8\ub85c\ub3c4 \ud50c\ub808\uc774 \uac00\ub2a5\ud569\ub2c8\ub2e4.',
      guest_name_placeholder: '\uac8c\uc2a4\ud2b8 \uc774\ub984',
      play_as_guest: '\uac8c\uc2a4\ud2b8\ub85c \ud50c\ub808\uc774',
      sign_in_google: 'Google\ub85c \ub85c\uadf8\uc778',
      google_disclaimer: '*\uad6c\uae00 \ub85c\uadf8\uc778 \uc2dc \uc790\ub3d9\uc73c\ub85c \ub2c9\ub124\uc784\uc774 \ubd80\uc5ec\ub3fc\uc694.\n\u00A0\u00A0\uc2e4\uba85\uc740 \ub178\ucd9c\ub418\uc9c0 \uc54a\uc544\uc694.',
      sign_out: '\ub85c\uadf8\uc544\uc6c3',
      continue_btn: '\uacc4\uc18d\ud558\uae30',

      // Lobby
      lobby: '\ub85c\ube44',
      lobby_desc: '\ubc29\uc744 \ub9cc\ub4e4\uac70\ub098 \uae30\uc874 \ubc29\uc5d0 \ucc38\uc5ec\ud558\uc138\uc694.',
      enter_room_code: '\ubc29 \ucf54\ub4dc \uc785\ub825',
      join: '\ucc38\uc5ec',
      or: '\ub610\ub294',
      create_room: '\ubc29 \ub9cc\ub4e4\uae30',
      random_match: '\ub79c\ub364 \ub9e4\uce58',
      play_vs_bot: '\uD83E\uDD16 \ubd07 \ub300\uc804',
      dice_skin: '\uc8fc\uc0ac\uc704 \uc2a4\ud0a8',
      skin_unlock_hint: '\uac8c\uc784\uc744 \ud50c\ub808\uc774\ud558\uc5ec \uc2a4\ud0a8\uc744 \uc7a0\uae08 \ud574\uc81c\ud558\uc138\uc694.\n\ubd07\uc744 \uc774\uae30\uba74 \ubd07 \uc2a4\ud0a8\uc744 \ud68d\ub4dd\ud569\ub2c8\ub2e4.',
      skin_play_unlock: '\uD83C\uDFB2 \ud50c\ub808\uc774\ud558\uc5ec \uc7a0\uae08\ud574\uc81c',
      skin_bot_unlock: '\uD83E\uDD16 \ubd07\uc5d0\uac8c \uc2b9\ub9ac\uc2dc \uc7a0\uae08\ud574\uc81c',
      skin_unlocked_count: '\ud574\uc81c',
      skin_games_count: '\ud310',
      skin_wins_count: '\uc2b9',
      skin_vs_bot: 'vs',
      skin_streak: '\uc5f0\uc2b9',
      my_stats: '\uD83D\uDCCA \ub0b4 \uc804\uc801',
      back_to_login: '\ub85c\uadf8\uc778\uc73c\ub85c \ub3cc\uc544\uac00\uae30',
      feedback: '\ud53c\ub4dc\ubc31',
      session_notice: '* \ud0ed\uc744 \ub2eb\uc73c\uba74 \uc138\uc158\uc774 \uc885\ub8cc\ub429\ub2c8\ub2e4.\n  \ud0ed\uc744 \uc5f4\uc5b4\ub450\uba74 \uc720\uc9c0\ub429\ub2c8\ub2e4.',

      // History
      recent_games: '\ucd5c\uadfc \uac8c\uc784',
      back_to_lobby: '\ub85c\ube44\ub85c \ub3cc\uc544\uac00\uae30',
      games: '\uac8c\uc784',
      wins: '\uc2b9',
      losses: '\ud328',
      ties: '\ubb34\uc2b9\ubd80',
      win_rate: '\uc2b9\ub960',
      no_games: '\uc544\uc9c1 \ud50c\ub808\uc774\ud55c \uac8c\uc784\uc774 \uc5c6\uc2b5\ub2c8\ub2e4.',
      result_w: '\uc2b9',
      result_l: '\ud328',
      result_t: '\ubb34',
      result_inv: '\ubb34\ud6a8',
      result_criteria_title: '\ud310\uc815 \uae30\uc900',
      result_w_label: '\uc2b9\ub9ac',
      result_l_label: '\ud328\ubc30',
      result_t_label: '\ubb34\uc2b9\ubd80',
      result_inv_label: '\ubb34\ud6a8',
      result_criteria_win: '\ub192\uc740 \uc810\uc218 \ub610\ub294 \uc0c1\ub300 \uae30\uad8c',
      result_criteria_loss: '\uc0c1\ub300\ubcf4\ub2e4 \ub0ae\uc740 \uc810\uc218 \ub610\ub294 \uae30\uad8c',
      result_criteria_tie: '\ub3d9\uc810 \ub610\ub294 \uc591\uce21 \ub3d9\uc758',
      result_criteria_invalid: '\ucd5c\uc18c \uc810\uc218 \ubbf8\ub2ec (\uc694\ud2b8 50 / \uc57c\ucc0c 100) \ub610\ub294 \uac8c\uc784 \uc2dc\uac04 2\ubd84 \ubbf8\ub9cc',
      result_criteria_invalid2: '\ubb34\ud6a8\ub294 \uc2b9\ub960\uc5d0 \ubbf8\ud3ec\ud568',
      mode_yacht: '\uc694\ud2b8',
      mode_yahtzee: '\uc57c\ucc0c',
      date: '\ub0a0\uc9dc',
      mode: '\ubaa8\ub4dc',
      opponent: '\uc0c1\ub300',
      score: '\uc810\uc218',
      result: '\uacb0\uacfc',

      // Waiting Room
      waiting_room: '\ub300\uae30\uc2e4',
      share_code: '\uce5c\uad6c\uc5d0\uac8c \uc774 \ucf54\ub4dc\ub97c \uacf5\uc720\ud558\uc138\uc694:',
      select_game_mode: '\uac8c\uc784 \ubaa8\ub4dc \uc120\ud0dd:',
      yahtzee_desc: '13\uac1c \uce74\ud14c\uace0\ub9ac, \ubcf4\ub108\uc2a4 \uc810\uc218',
      yacht_desc: '12\uac1c \uce74\ud14c\uace0\ub9ac, \ud074\ub798\uc2dd \uaddc\uce59',
      waiting_for_opponent: '\uc0c1\ub300\ub97c \uae30\ub2e4\ub9ac\ub294 \uc911...',
      back_to_lobby_arrow: '\u2190 \ub85c\ube44\ub85c \ub3cc\uc544\uac00\uae30',
      random_match: '\ub79c\ub364 \ub9e4\uce58',
      random_match_title: '\ub79c\ub364 \ub9e4\uce58',
      random_searching: '\uc0c1\ub300\ub97c \ucc3e\ub294 \uc911...',
      random_matched: '\uc0c1\ub300\ub97c \ucc3e\uc558\uc2b5\ub2c8\ub2e4!',
      find_opponent: '\uc0c1\ub300 \ucc3e\uae30',
      any_mode: '\uc0c1\uad00\uc5c6\uc74c',
      any_mode_desc: '\uc544\ubb34 \uac8c\uc784 \ubaa8\ub4dc\uc640 \ub9e4\uce6d',

      // Bot Setup
      bot_game: '\ubd07 \ub300\uc804',
      basic: '\uc77c\ubc18',
      gambler: '\ub3c4\ubc15\uc0ac',
      basic_bot: '\uc77c\ubc18 \ubd07',
      gambler_bot: '\ub3c4\ubc15\uc0ac \ubd07',
      basic_desc: '\uc801\ub2f9\ud55c \uc218\uc900\uc758 AI',
      gambler_desc: '\ucd5c\uc801\ud654\ub41c \uc804\ub7b5 AI',
      wave: '\ud574\uc77c',
      wave_bot: '\ud574\uc77c \ubd07',
      wave_desc: '\uc2b9\ub960 \uadf9\ub300\ud654 \uc804\ub7b5 AI',
      start_game: '\uac8c\uc784 \uc2dc\uc791',

      // Game
      btn_shortcut: '\ub2e8\ucd95\ud0a4',
      btn_rule: '\uaddc\uce59',
      btn_draw: '\ubb34\uc2b9\ubd80',
      btn_quit: '\uae30\uad8c',
      title_yacht: '\uc694\ud2b8 \ub2e4\uc774\uc2a4',
      title_yahtzee: '\uc57c\ucc0c \ub2e4\uc774\uc2a4',
      shortcut_title: 'PC \ub2e8\ucd95\ud0a4',
      rule_title: '\uaddc\uce59',
      leave_title: '\ub098\uac00\uae30',
      lets_roll: '\uad74\ub9ac\uae30!',
      roll_end: '\uad74\ub9bc \ub05d',
      foes_turn: '\uc0c1\ub300 \ud134',
      category: '\uce74\ud14c\uace0\ub9ac',
      bonus: '\ubcf4\ub108\uc2a4',
      yahtzee_bonus: '\uc57c\ucc0c \ubcf4\ub108\uc2a4',
      total: '\ud569\uacc4',
      confirm_hint: '\ud55c \ubc88 \ub354 \ud0ed\ud558\uc5ec \ud655\uc815',

      // Game Over
      you_win: '\uc2b9\ub9ac!',
      you_lose: '\ud328\ubc30',
      its_a_tie: '\ubb34\uc2b9\ubd80!',
      player: '\ud50c\ub808\uc774\uc5b4',
      new_game: '\uc0c8 \uac8c\uc784',

      // Disconnect
      opponent_disconnected: '\uc0c1\ub300\uac00 \uc5f0\uacb0 \ub04a\uacbc\uc2b5\ub2c8\ub2e4.\n\uc7ac\uc811\uc18d \ub300\uae30 \uc911...',
      auto_win_in: '\uc790\ub3d9 \uc2b9\ub9ac\uae4c\uc9c0',

      // Leave confirm
      confirm_leave_bot: '\ubd07 \uac8c\uc784\uc744 \uc885\ub8cc\ud558\uc2dc\uaca0\uc2b5\ub2c8\uae4c?\n\ud328\ubc30\ub85c \uae30\ub85d\ub429\ub2c8\ub2e4.',
      confirm_leave_online: '\uc815\ub9d0 \ub098\uac00\uc2dc\uaca0\uc2b5\ub2c8\uae4c?\n\uc0c1\ub300\ubc29\uc758 \uc2b9\ub9ac\ub85c \ucc98\ub9ac\ub429\ub2c8\ub2e4.',
      confirm_yes: '\uae30\uad8c',
      confirm_no: '\ucde8\uc18c',

      // Draw
      // Toast messages
      toast_duplicate_tab: '\ub2e4\ub978 \ud0ed\uc5d0\uc11c \uc0c8 \uac8c\uc784\uc774 \uc2dc\uc791\ub418\uc5c8\uc2b5\ub2c8\ub2e4.',
      toast_signin_failed: '\ub85c\uadf8\uc778 \uc2e4\ud328',
      toast_unknown_error: '\uc54c \uc218 \uc5c6\ub294 \uc624\ub958',
      toast_joined_room: '\ubc29 \ucc38\uc5ec',
      toast_name_required: '\uba3c\uc800 \uc774\ub984\uc744 \uc124\uc815\ud574\uc8fc\uc138\uc694.',
      toast_code_copied: '\ucf54\ub4dc\uac00 \ubcf5\uc0ac\ub418\uc5c8\uc2b5\ub2c8\ub2e4!',
      toast_reconnected: '\uac8c\uc784\uc5d0 \uc7ac\uc811\uc18d\ub418\uc5c8\uc2b5\ub2c8\ub2e4!',
      toast_player_joined: '\ub2d8\uc774 \ucc38\uc5ec\ud588\uc2b5\ub2c8\ub2e4!',
      toast_room_not_found: '\ubc29\uc744 \ucc3e\uc744 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4.',
      toast_room_full: '\ubc29\uc774 \uac00\ub4dd \ucc3c\uc2b5\ub2c8\ub2e4.',
      toast_room_in_game: '\uc774\ubbf8 \uac8c\uc784 \uc911\uc778 \ubc29\uc785\ub2c8\ub2e4.',
      toast_create_failed: '\ubc29 \uc0dd\uc131\uc5d0 \uc2e4\ud328\ud588\uc2b5\ub2c8\ub2e4.',
      toast_join_failed: '\ubc29 \ucc38\uc5ec\uc5d0 \uc2e4\ud328\ud588\uc2b5\ub2c8\ub2e4.',
      toast_random_failed: '\ub79c\ub364 \ub9e4\uce58\uc5d0 \uc2e4\ud328\ud588\uc2b5\ub2c8\ub2e4.',
      toast_rate_limit: '\uc694\uccad\uc774 \ub108\ubb34 \ub9ce\uc2b5\ub2c8\ub2e4. \uc7a0\uc2dc \ud6c4 \ub2e4\uc2dc \uc2dc\ub3c4\ud574\uc8fc\uc138\uc694.',

      draw_proposal_msg: '\uc0c1\ub300\ubc29\uc774 \ubb34\uc2b9\ubd80\ub97c \uc81c\uc548\ud588\uc2b5\ub2c8\ub2e4.\n\uc218\ub77d\ud558\uc2dc\uaca0\uc2b5\ub2c8\uae4c?',
      draw_proposed: '\ubb34\uc2b9\ubd80\ub97c \uc81c\uc548\ud588\uc2b5\ub2c8\ub2e4.\n\uc751\ub2f5 \ub300\uae30 \uc911...',
      bot_no_draw: '로봇은 무승부를 몰라요🤖',
      draw_declined: '\uc0c1\ub300\ubc29\uc774 \ubb34\uc2b9\ubd80\ub97c \uac70\uc808\ud588\uc2b5\ub2c8\ub2e4.',
      accept: '\uc218\ub77d',
      decline: '\uac70\uc808',

      // Category names
      cat_ones: '1\uc758 \ud569',
      cat_twos: '2\uc758 \ud569',
      cat_threes: '3\uc758 \ud569',
      cat_fours: '4\uc758 \ud569',
      cat_fives: '5\uc758 \ud569',
      cat_sixes: '6\uc758 \ud569',
      cat_choice: '\ucd08\uc774\uc2a4',
      cat_chance: '\ucc2c\uc2a4',
      cat_threeOfAKind: '\uc4f0\ub9ac \ub2e4\uc774\uc2a4',
      cat_fourOfAKind: '\ud3ec \ub2e4\uc774\uc2a4',
      cat_fullHouse: '\ud480\ud558\uc6b0\uc2a4',
      cat_smallStraight: '\uc2a4\ubab0 \uc2a4\ud2b8\ub808\uc774\ud2b8',
      cat_largeStraight: '\ub77c\uc9c0 \uc2a4\ud2b8\ub808\uc774\ud2b8',
      cat_yacht: '\uc694\ud2b8',
      cat_yahtzee: '\uc57c\ucc0c',

      // Rules - Yacht
      rules_yacht_title: '\uc694\ud2b8 \uaddc\uce59',
      rules_cat: '\uce74\ud14c\uace0\ub9ac',
      rules_score: '\uc810\uc218',
      rules_ones_sixes: '1\uc758 \ud569 ~ 6\uc758 \ud569',
      rules_ones_sixes_desc: '\ud574\ub2f9 \uc22b\uc790\uc758 \ud569',
      rules_foak: '\ud3ec \ub2e4\uc774\uc2a4',
      rules_foak_desc: '\uac19\uc740 \uc22b\uc790 4\uac1c\uc758 \ud569',
      rules_fh: '\ud480\ud558\uc6b0\uc2a4',
      rules_fh_desc: '3+2 \uc870\ud569 \uc2dc \uc804\uccb4 \ud569',
      rules_ss_yacht: '\uc2a4\ubab0 \uc2a4\ud2b8\ub808\uc774\ud2b8',
      rules_ss_yacht_desc: '1-2-3-4-5 \u2192 30\uc810',
      rules_ls_yacht: '\ub77c\uc9c0 \uc2a4\ud2b8\ub808\uc774\ud2b8',
      rules_ls_yacht_desc: '2-3-4-5-6 \u2192 30\uc810',
      rules_choice: '\ucd08\uc774\uc2a4',
      rules_choice_desc: '\uc8fc\uc0ac\uc704 \uc804\uccb4 \ud569',
      rules_yacht: '\uc694\ud2b8',
      rules_yacht_desc: '5\uac1c \ub3d9\uc77c \u2192 50\uc810',
      rules_yacht_note: '\ub9e4 \ud134 \ucd5c\ub300 3\ud68c \uad74\ub9bc.\n\uc8fc\uc0ac\uc704\ub97c \ud074\ub9ad\ud558\uc5ec \uace0\uc815/\ud574\uc81c.',

      // Rules - Yahtzee
      rules_yahtzee_title: '\uc57c\ucc0c \uaddc\uce59',
      rules_toak: '\uc4f0\ub9ac \ub2e4\uc774\uc2a4',
      rules_toak_desc: '3\uac1c \uc774\uc0c1 \ub3d9\uc77c \u2192 \uc804\uccb4 \ud569',
      rules_foak_yahtzee_desc: '4\uac1c \uc774\uc0c1 \ub3d9\uc77c \u2192 \uc804\uccb4 \ud569',
      rules_fh_yahtzee: '\ud480\ud558\uc6b0\uc2a4',
      rules_fh_yahtzee_desc: '3+2 \uc870\ud569 \u2192 25\uc810',
      rules_ss_yahtzee: '\uc2a4\ubab0 \uc2a4\ud2b8\ub808\uc774\ud2b8',
      rules_ss_yahtzee_desc: '4\uc5f0\uc18d \u2192 30\uc810',
      rules_ls_yahtzee: '\ub77c\uc9c0 \uc2a4\ud2b8\ub808\uc774\ud2b8',
      rules_ls_yahtzee_desc: '5\uc5f0\uc18d \u2192 40\uc810',
      rules_yahtzee_cat: '\uc57c\ucc0c',
      rules_yahtzee_cat_desc: '5\uac1c \ub3d9\uc77c \u2192 50\uc810',
      rules_chance: '\ucc2c\uc2a4',
      rules_chance_desc: '\uc8fc\uc0ac\uc704 \uc804\uccb4 \ud569',
      rules_yahtzee_bonus_note: '\uc0c1\ub2e8 \ud569\uacc4 \u2265 63 \u2192 \ubcf4\ub108\uc2a4 +35\uc810\n\ucd94\uac00 \uc57c\ucc0c\ub2f9 \ubcf4\ub108\uc2a4 +100\uc810',
      rules_yahtzee_note: '\ub9e4 \ud134 \ucd5c\ub300 3\ud68c \uad74\ub9bc.\n\uc8fc\uc0ac\uc704\ub97c \ud074\ub9ad\ud558\uc5ec \uace0\uc815/\ud574\uc81c.',

      // Shortcut overlay
      shortcut_title_overlay: 'PC \ub2e8\ucd95\ud0a4',
      shortcut_key: '\ud0a4',
      shortcut_action: '\ub3d9\uc791',
      shortcut_dice: '\uc8fc\uc0ac\uc704 \uc120\ud0dd/\ud574\uc81c',
      shortcut_emote: '\ud035 \uc774\ubaa8\ud2f0\ucf58 \uc804\uc1a1',
      shortcut_nav: '\uce74\ud14c\uace0\ub9ac & Roll \uc21c\ud658',
      shortcut_confirm: '\uc120\ud0dd \ud655\uc815 / Roll',

      // Tutorial
      tutorial: '\ud29c\ud1a0\ub9ac\uc5bc',
      tutorial_btn: '\ud83d\udcd6 \ud50c\ub808\uc774 \ubc29\ubc95',
      tut_intro: '\uc694\ud2b8 \ub2e4\uc774\uc2a4\uc5d0 \uc624\uc2e0 \uac83\uc744 \ud658\uc601\ud569\ub2c8\ub2e4! \ud50c\ub808\uc774 \ubc29\ubc95\uc744 \uc54c\uc544\ubcf4\uc138\uc694.',
      tut_scorecard: '\uc774\uac83\uc774 \uc2a4\ucf54\uc5b4\uce74\ub4dc\uc785\ub2c8\ub2e4.\n\ubaa8\ub4e0 \uce74\ud14c\uace0\ub9ac\ub97c \ucc44\uc6b0\uba74 \uac8c\uc784\uc774 \ub05d\ub0a9\ub2c8\ub2e4.',
      tut_dice: '\uc8fc\uc0ac\uc704 5\uac1c\uc640 \uad74\ub9ac\uae30 \ubc84\ud2bc\uc785\ub2c8\ub2e4.\n\ud134\ub2f9 3\ud68c \uad74\ub9b4 \uc218 \uc788\uc2b5\ub2c8\ub2e4.',
      tut_roll: '\uad74\ub9ac\uae30 \ubc84\ud2bc\uc744 \ud074\ub9ad\ud558\uc5ec \uc8fc\uc0ac\uc704\ub97c \uad74\ub824\ubcf4\uc138\uc694!',
      tut_hold: '\uc8fc\uc0ac\uc704\ub97c \ud074\ub9ad\ud574\uc11c \uace0\uc815\ud574\ubcf4\uc138\uc694!\n\uace0\uc815\ub41c \uc8fc\uc0ac\uc704\ub294 \ub2e4\uc2dc \uad74\ub9ac\uc9c0 \uc54a\uc2b5\ub2c8\ub2e4.',
      tut_reroll: '\ub2e4\uc2dc \uad74\ub824\ubcf4\uc138\uc694!\n\uace0\uc815\ub41c \uc8fc\uc0ac\uc704\ub294 \uadf8\ub300\ub85c\uc785\ub2c8\ub2e4.',
      tut_scoring: '\uce74\ud14c\uace0\ub9ac\ub97c \uc120\ud0dd\ud558\uc5ec \uc810\uc218\ub97c \uae30\ub85d\ud558\uc138\uc694.\n\ud55c \ubc88 \ud0ed\ud558\uba74 \ubbf8\ub9ac\ubcf4\uae30, \ub2e4\uc2dc \ud0ed\ud558\uba74 \ud655\uc815\ub429\ub2c8\ub2e4.',
      tut_summary: '\uc644\ub8cc! \uae30\ubcf8\uc744 \uc775\ud614\uc2b5\ub2c8\ub2e4.\n\ubd07 \ub300\uc804\uc73c\ub85c \uc5f0\uc2b5\ud574 \ubcf4\uc138\uc694!',
      tut_next: '\ub2e4\uc74c',
      tut_skip: '\ud29c\ud1a0\ub9ac\uc5bc \uac74\ub108\ub6f0\uae30',
      tut_skip_short: '\uac74\ub108\ub6f0\uae30',
      tut_start_playing: '\ud648\uc73c\ub85c',
      tut_you: '\ub098',
      tut_opponent: '\uc0c1\ub300'
    }
  };

  var currentLang = localStorage.getItem('yacht-lang') || 'ko';

  function t(key) {
    var dict = STRINGS[currentLang] || STRINGS['en'];
    return dict[key] || STRINGS['en'][key] || key;
  }

  function setLang(lang) {
    currentLang = lang;
    localStorage.setItem('yacht-lang', lang);
  }

  function getLang() {
    return currentLang;
  }

  function refreshStaticText() {
    var els = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < els.length; i++) {
      var key = els[i].getAttribute('data-i18n');
      if (key) els[i].textContent = t(key);
    }
    var placeholders = document.querySelectorAll('[data-i18n-placeholder]');
    for (var i = 0; i < placeholders.length; i++) {
      var key = placeholders[i].getAttribute('data-i18n-placeholder');
      if (key) placeholders[i].placeholder = t(key);
    }
    var titles = document.querySelectorAll('[data-i18n-title]');
    for (var i = 0; i < titles.length; i++) {
      var key = titles[i].getAttribute('data-i18n-title');
      if (key) titles[i].title = t(key);
    }
  }

  window.YachtGame.I18n = {
    t: t,
    setLang: setLang,
    getLang: getLang,
    refreshStaticText: refreshStaticText
  };
})();
