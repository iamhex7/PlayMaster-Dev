/**
 * 谁是卧底：预置词库（平民词 / 卧底词）
 */
export const AMONG_US_WORD_PAIRS = [
  { civilian: '胡萝卜', spy: '白萝卜' },
  { civilian: '玫瑰', spy: '月季' },
  { civilian: '包菜', spy: '生菜' },
  { civilian: '土豆', spy: '红薯' },
  { civilian: '橙子', spy: '橘子' },
  { civilian: '蝴蝶', spy: '飞蛾' },
  { civilian: '猴子', spy: '猩猩' },
  { civilian: '香皂', spy: '沐浴露' },
  { civilian: '辣椒', spy: '青椒' },
  { civilian: '牛奶', spy: '豆浆' },
  { civilian: '馒头', spy: '包子' },
  { civilian: '饺子', spy: '馄饨' },
  { civilian: '拖鞋', spy: '凉鞋' },
  { civilian: '手机', spy: '平板' },
  { civilian: '西瓜', spy: '冬瓜' }
]

/**
 * 内置示例游戏的结构化数据（供「走后门」跳过 AI 解析）
 */
export const SAMPLE_GAMES = {
  'among-us': {
    game_name: '谁是卧底',
    gameId: 'among-us',
    min_players: 4,
    max_players: 12,
    game_schema: {
      game_type: 'word_based',
      distribution: { type: 'words', word_generation: 'preset_pairs' },
      phase_interactions: [
        { phase_id: 'description', phase_name: '描述阶段', in_app_input: false, transition_trigger: 'host_confirm', transition_prompt: '描述结束，进入投票', transition_target: 'first_player' },
        { phase_id: 'voting', phase_name: '投票阶段', in_app_input: true, action_type: 'select', action_target: 'all_players', options_source: 'all_players', action_prompt: '投票选出你认为的卧底（单选题）' }
      ]
    },
    opening_speech: '欢迎来到「谁是卧底」。平民拿到相同词语，卧底拿到相近词语，白板则无词。通过描述找出同伴、揪出卧底；卧底则隐藏身份、伪装平民。平民找出所有卧底则平民胜；卧底坚持到最后且平民人数不超过卧底则卧底胜。祝各位好运！',
    phases: ['描述阶段：玩家轮流用一句话描述自己的词', '投票阶段：讨论后投票选出描述最不像大家的人', '出局阶段：得票最多者出局，检查胜负'],
    win_condition: '平民找出所有卧底则平民胜；卧底坚持到最后且场上平民人数 ≤ 卧底人数则卧底胜。',
    resources: '每人获得一个词语（平民/卧底）或白板（无词）。',
    role_distribution_rules: [
      { min: 4, max: 5, civilian: [3, 4], spy: 1, blank: 0 },
      { min: 6, max: 8, civilian: [4, 5, 6], spy: [1, 2], blank: [0, 1] },
      { min: 9, max: 12, civilian: [6, 7, 8, 9], spy: 2, blank: [0, 1] }
    ]
  },
  'texas-holdem': {
    game_name: '德州扑克',
    gameId: 'texas-holdem',
    min_players: 1,
    max_players: 10,
    cards_per_player: 2,
    game_schema: {
      game_type: 'card_based',
      distribution: {
        type: 'cards',
        deck_type: 'standard_52',
        cards_per_player: 2
      },
      phase_interactions: [
        { phase_id: 'pre_flop', phase_name: '翻牌前下注', in_app_input: true, action_type: 'select', action_target: 'current_player', action_options: ['弃牌', '过牌', '跟注', '加注'] },
        { phase_id: 'flop', phase_name: '翻牌', deal_from_deck: 3 },
        { phase_id: 'turn', phase_name: '转牌', deal_from_deck: 1 },
        { phase_id: 'river', phase_name: '河牌', deal_from_deck: 1 },
        { phase_id: 'showdown', phase_name: '摊牌比牌' }
      ]
    },
    initial_items: { chips: 500 },
    small_blind: 10,
    big_blind: 20,
    opening_speech: '欢迎来到德州扑克。每人 2 张底牌，通过翻牌、转牌、河牌与下注，组成最强五张牌。祝你好运！',
    phases: [
      '下盲注：1号玩家为小盲，2号为大盲，单人默认为小盲',
      '发底牌：每人 2 张底牌',
      '第一轮下注：跟注、加注或弃牌',
      '翻牌：揭示 3 张公共牌',
      '第二轮下注',
      '转牌：揭示第 4 张公共牌',
      '第三轮下注',
      '河牌：揭示第 5 张公共牌',
      '最后一轮下注',
      '摊牌：比牌，最好的五张牌获胜'
    ],
    win_condition: '用手中的 2 张底牌与 5 张公共牌组成最好的五张牌。牌型从高到低：皇家同花顺、同花顺、四条、满堂红、同花、顺子、三条、两对、一对、高牌。',
    resources: '每人获得 500 筹码。小盲注 10，大盲注 20。'
  },
  'neon-heist': {
    game_name: 'Neon Heist: The Core (霓虹劫案)',
    gameId: 'neon-heist',
    game_schema: {
      game_type: 'role_based',
      distribution: { type: 'roles', cards_per_player: 1 },
      phase_interactions: [
        { phase_id: 'infiltration', phase_name: '渗透阶段', in_app_input: true, action_type: 'confirm', action_target: 'current_player' },
        { phase_id: 'vault', phase_name: '核心金库', in_app_input: true, action_type: 'input', action_target: 'current_player' },
        { phase_id: 'extraction', phase_name: '撤离阶段', in_app_input: true, action_type: 'confirm', action_target: 'current_player' }
      ]
    },
    players_setup: '3-5名玩家，分为黑客、保镖和中间人。核心任务是窃取欧米茄核心并撤离。',
    resources: '每人初始拥有：1000 信用点、1 个神经链接、2 点行动力。',
    phases: [
      '渗透阶段：消耗行动力潜入安全网格。',
      '核心金库：破解 3 位数动态密码锁。',
      '撤离阶段：躲避安全无人机，在 5 回合内到达接应面包车。'
    ],
    win_condition: '团队成功提取核心并在 5 回合内到达接应点。',
    opening_speech: '（低沉的合成音）欢迎来到不夜城的阴影。今晚的目标是欧米茄核心。黑客、保镖、中间人，检查你们的神经链接。核心到手，大家下半辈子在沙滩度过；被抓到了，就等着被格式化。行动开始！',
    roles: [
      { name: '黑客 (Hacker)', count: 1, skill_summary: '无需消耗行动点即可绕过安全锁。' },
      { name: '保镖 (Bodyguard)', count: 1, skill_summary: '保护一名队友免受安全系统标记。' },
      { name: '中间人 (Fixer)', count: 1, skill_summary: '在策划阶段可以在任意两名玩家间进行物品交易。' },
      { name: '平民专家', count: 2, skill_summary: '协助潜入，提供额外的行动支援。' }
    ],
    cards_per_player: 1,
    initial_items: { credits: 1000, neural_link: 1, action_points: 2 },
    min_players: 3,
    max_players: 5
  }
}
